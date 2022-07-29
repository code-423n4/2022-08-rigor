// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IHomeFi} from "../interfaces/IHomeFi.sol";
import {IProjectFactory} from "../interfaces/IProjectFactory.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {ContextUpgradeable, ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";

/**
 * @title HomeFi v0.1.0 HomeFi Contract
 * @notice Main on-chain client.
 * Administrative controls and project deployment
 */
contract HomeFiMock is
    IHomeFi,
    ReentrancyGuardUpgradeable,
    ERC721URIStorageUpgradeable,
    ERC2771ContextUpgradeable
{
    /// VARIABLES ///
    address public override tokenCurrency1;
    address public override tokenCurrency2;
    address public override tokenCurrency3;

    IProjectFactory public override projectFactoryInstance;
    address public override disputesContract;
    address public override communityContract;

    bool public override addrSet;
    address public override admin;
    address public override treasury;
    uint256 public override lenderFee;
    uint256 public override projectCount;
    address public override trustedForwarder;
    mapping(uint256 => address) public override projects;
    mapping(address => uint256) public override projectTokenId;
    mapping(address => address) public override wrappedToken;

    modifier onlyAdmin() {
        require(admin == _msgSender(), "HomeFi::!Admin");
        _;
    }

    modifier nonZero(address _address) {
        require(_address != address(0), "HomeFi::0 address");
        _;
    }

    function initialize(
        address _treasury,
        uint256 _lenderFee,
        address _tokenCurrency1,
        address _tokenCurrency2,
        address _tokenCurrency3,
        address _forwarder
    )
        external
        override
        initializer
        nonZero(_treasury)
        nonZero(_tokenCurrency1)
        nonZero(_tokenCurrency2)
        nonZero(_tokenCurrency3)
    {
        __ERC721_init("HomeFiNFT", "hNFT");
        __ERC2771Context_init(_forwarder);
        admin = _msgSender();
        treasury = _treasury;
        lenderFee = _lenderFee; // these percent shall be multiplied by 1000.
        tokenCurrency1 = _tokenCurrency1;
        tokenCurrency2 = _tokenCurrency2;
        tokenCurrency3 = _tokenCurrency3;
        trustedForwarder = _forwarder;
    }

    function setAddr(
        address _projectFactory,
        address _communityContract,
        address _disputesContract,
        address _hTokenCurrency1,
        address _hTokenCurrency2,
        address _hTokenCurrency3
    )
        external
        override
        onlyAdmin
        nonZero(_projectFactory)
        nonZero(_communityContract)
        nonZero(_disputesContract)
        nonZero(_hTokenCurrency1)
        nonZero(_hTokenCurrency2)
        nonZero(_hTokenCurrency3)
    {
        require(!addrSet, "HomeFi::Set");
        projectFactoryInstance = IProjectFactory(_projectFactory);
        communityContract = _communityContract;
        disputesContract = _disputesContract;
        wrappedToken[tokenCurrency1] = _hTokenCurrency1;
        wrappedToken[tokenCurrency2] = _hTokenCurrency2;
        wrappedToken[tokenCurrency3] = _hTokenCurrency3;
        addrSet = true;
        emit AddressSet();
    }

    function replaceAdmin(address _newAdmin)
        external
        override
        onlyAdmin
        nonZero(_newAdmin)
    {
        require(admin != _newAdmin, "HomeFi::!Change");
        admin = _newAdmin;
        emit AdminReplaced(_newAdmin);
    }

    function replaceTreasury(address _newTreasury)
        external
        override
        onlyAdmin
        nonZero(_newTreasury)
    {
        require(treasury != _newTreasury, "HomeFi::!Change");
        treasury = _newTreasury;
        emit TreasuryReplaced(_newTreasury);
    }

    function replaceLenderFee(uint256 _newLenderFee)
        external
        override
        onlyAdmin
    {
        require(lenderFee != _newLenderFee, "HomeFi::!Change");
        lenderFee = _newLenderFee;
        emit LenderFeeReplaced(_newLenderFee);
    }

    function createProject(bytes memory _hash, address _currency)
        external
        override
        nonReentrant
    {
        validCurrency(_currency);
        address _sender = _msgSender();
        address _project = projectFactoryInstance.createProject(
            _currency,
            _sender
        );
        mintNFT(_sender, string(_hash));
        projects[projectCount] = _project;
        projectTokenId[_project] = projectCount;
        emit ProjectAdded(projectCount, _project, _sender, _currency, _hash);
    }

    function isTrustedForwarder(address _forwarder)
        public
        view
        override(ERC2771ContextUpgradeable, IHomeFi)
        returns (bool)
    {
        return trustedForwarder == _forwarder;
    }

    function isProjectExist(address _project)
        public
        view
        override
        returns (bool)
    {
        return projectTokenId[_project] > 0;
    }

    function validCurrency(address _currency) public view override {
        require(
            _currency == tokenCurrency1 ||
                _currency == tokenCurrency2 ||
                _currency == tokenCurrency3,
            "HomeFi::!Currency"
        );
    }

    function setTrustedForwarder(address _newForwarder)
        external
        virtual
        override
        onlyAdmin
    {
        trustedForwarder = _newForwarder;
    }

    /**
     * @dev make every project NFT
     * @param _to to which user this NFT belong to first time it will builder
     * @param _tokenURI ipfs hash of project which contain project details like name, description etc.
     * @return _tokenIds NFT Id of project
     */
    function mintNFT(address _to, string memory _tokenURI)
        internal
        returns (uint256)
    {
        // this make sure we start with tokenID = 1
        projectCount += 1;
        _mint(_to, projectCount);
        _setTokenURI(projectCount, _tokenURI);
        emit NftCreated(projectCount, _to);
        return projectCount;
    }

    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address sender)
    {
        // this is same as ERC2771ContextUpgradeable._msgSender();
        // We want to use the _msgSender() implementation of ERC2771ContextUpgradeable
        return super._msgSender();
    }

    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes calldata)
    {
        // this is same as ERC2771ContextUpgradeable._msgData();
        // We want to use the _msgData() implementation of ERC2771ContextUpgradeable
        return super._msgData();
    }
}
