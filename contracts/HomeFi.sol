// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IHomeFi} from "./interfaces/IHomeFi.sol";
import {IProjectFactory} from "./interfaces/IProjectFactory.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {ContextUpgradeable, ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";

/**
 * @title HomeFi v2.5.0 HomeFi Contract.

 * @notice Main on-chain client.
 * Administrative controls and project deployment.
 
 * @dev
 * Adheres to -
 * IHomeFi: Allows this contract to be used by other HomeFi contracts.

 * @dev
 * Inherits from -
 * ReentrancyGuardUpgradeable: Contract module that helps prevent reentrant calls to a function.
 * ERC721URIStorageUpgradeable: ERC721 token with storage based token URI management.
 * ERC2771ContextUpgradeable: Context variant with ERC2771 support.
 */
contract HomeFi is
    IHomeFi,
    ReentrancyGuardUpgradeable,
    ERC721URIStorageUpgradeable,
    ERC2771ContextUpgradeable
{
    /*******************************************************************************
     * -------------------------PUBLIC STORED PROPERTIES-------------------------- *
     *******************************************************************************/

    /// @inheritdoc IHomeFi
    address public override tokenCurrency1;
    /// @inheritdoc IHomeFi
    address public override tokenCurrency2;
    /// @inheritdoc IHomeFi
    address public override tokenCurrency3;
    /// @inheritdoc IHomeFi
    IProjectFactory public override projectFactoryInstance;
    /// @inheritdoc IHomeFi
    address public override disputesContract;
    /// @inheritdoc IHomeFi
    address public override communityContract;
    /// @inheritdoc IHomeFi
    bool public override addrSet;
    /// @inheritdoc IHomeFi
    address public override admin;
    /// @inheritdoc IHomeFi
    address public override treasury;
    /// @inheritdoc IHomeFi
    uint256 public override lenderFee;
    /// @inheritdoc IHomeFi
    uint256 public override projectCount;
    /// @inheritdoc IHomeFi
    address public override trustedForwarder;
    /// @inheritdoc IHomeFi
    mapping(uint256 => address) public override projects;
    /// @inheritdoc IHomeFi
    mapping(address => uint256) public override projectTokenId;
    /// @inheritdoc IHomeFi
    mapping(address => address) public override wrappedToken;

    /*******************************************************************************
     * ---------------------------------MODIFIERS--------------------------------- *
     *******************************************************************************/

    modifier onlyAdmin() {
        require(admin == _msgSender(), "HomeFi::!Admin");
        _;
    }

    modifier nonZero(address _address) {
        require(_address != address(0), "HomeFi::0 address");
        _;
    }

    modifier noChange(address _oldAddress, address _newAddress) {
        // Revert if new address is same as old
        require(_oldAddress != _newAddress, "HomeFi::!Change");
        _;
    }

    /*******************************************************************************
     * ---------------------------EXTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/
    /// @inheritdoc IHomeFi
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
        // Initialize ERC721 and ERC2771Context
        __ERC721_init("HomeFiNFT", "hNFT");
        __ERC2771Context_init(_forwarder);

        // Initialize variables
        admin = _msgSender();
        treasury = _treasury;
        lenderFee = _lenderFee; // the percentage must be multiplied with 10
        tokenCurrency1 = _tokenCurrency1;
        tokenCurrency2 = _tokenCurrency2;
        tokenCurrency3 = _tokenCurrency3;
        trustedForwarder = _forwarder;
    }

    /// @inheritdoc IHomeFi
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
        // Revert if addrSet is true
        require(!addrSet, "HomeFi::Set");

        // Initialize variables
        projectFactoryInstance = IProjectFactory(_projectFactory);
        communityContract = _communityContract;
        disputesContract = _disputesContract;
        wrappedToken[tokenCurrency1] = _hTokenCurrency1;
        wrappedToken[tokenCurrency2] = _hTokenCurrency2;
        wrappedToken[tokenCurrency3] = _hTokenCurrency3;
        addrSet = true;

        emit AddressSet();
    }

    /// @inheritdoc IHomeFi
    function replaceAdmin(address _newAdmin)
        external
        override
        onlyAdmin
        nonZero(_newAdmin)
        noChange(admin, _newAdmin)
    {
        // Replace admin
        admin = _newAdmin;

        emit AdminReplaced(_newAdmin);
    }

    /// @inheritdoc IHomeFi
    function replaceTreasury(address _newTreasury)
        external
        override
        onlyAdmin
        nonZero(_newTreasury)
        noChange(treasury, _newTreasury)
    {
        // Replace treasury
        treasury = _newTreasury;

        emit TreasuryReplaced(_newTreasury);
    }

    /// @inheritdoc IHomeFi
    function replaceLenderFee(uint256 _newLenderFee)
        external
        override
        onlyAdmin
    {
        // Revert if no change in lender fee
        require(lenderFee != _newLenderFee, "HomeFi::!Change");

        // Reset variables
        lenderFee = _newLenderFee;

        emit LenderFeeReplaced(_newLenderFee);
    }

    /// @inheritdoc IHomeFi
    function setTrustedForwarder(address _newForwarder)
        external
        override
        onlyAdmin
        noChange(trustedForwarder, _newForwarder)
    {
        trustedForwarder = _newForwarder;
    }

    /// @inheritdoc IHomeFi
    function createProject(bytes memory _hash, address _currency)
        external
        override
        nonReentrant
    {
        // Revert if currency not supported by HomeFi
        validCurrency(_currency);

        address _sender = _msgSender();

        // Create a new project Clone and mint a new NFT for it
        address _project = projectFactoryInstance.createProject(
            _currency,
            _sender
        );
        mintNFT(_sender, string(_hash));

        // Update project related mappings
        projects[projectCount] = _project;
        projectTokenId[_project] = projectCount;

        emit ProjectAdded(projectCount, _project, _sender, _currency, _hash);
    }

    /*******************************************************************************
     * ------------------------------EXTERNAL VIEWS------------------------------- *
     *******************************************************************************/

    /// @inheritdoc IHomeFi
    function isProjectExist(address _project)
        external
        view
        override
        returns (bool)
    {
        return projectTokenId[_project] > 0;
    }

    /*******************************************************************************
     * -------------------------------PUBLIC VIEWS-------------------------------- *
     *******************************************************************************/

    /// @inheritdoc IHomeFi
    function validCurrency(address _currency) public view override {
        // _currency must be one of HomeFi supported currencies
        require(
            _currency == tokenCurrency1 ||
                _currency == tokenCurrency2 ||
                _currency == tokenCurrency3,
            "HomeFi::!Currency"
        );
    }

    /// @inheritdoc IHomeFi
    function isTrustedForwarder(address _forwarder)
        public
        view
        override(ERC2771ContextUpgradeable, IHomeFi)
        returns (bool)
    {
        return trustedForwarder == _forwarder;
    }

    /*******************************************************************************
     * ---------------------------INTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/
    /**
     * @dev Makes an NFT for every project

     * @param _to address - NFT owner. Initially it will be the project builder.
     * @param _tokenURI string - IPFS hash of project details like name, description etc

     * @return _tokenIds NFT Id of project
     */
    function mintNFT(address _to, string memory _tokenURI)
        internal
        returns (uint256)
    {
        // Project count starts from 1
        projectCount += 1;

        // Mints NFT and set token URI
        _mint(_to, projectCount);
        _setTokenURI(projectCount, _tokenURI);

        emit NftCreated(projectCount, _to);
        return projectCount;
    }

    /*******************************************************************************
     * ------------------------------INTERNAL VIEWS------------------------------- *
     *******************************************************************************/
    /// @dev This is same as ERC2771ContextUpgradeable._msgSender()
    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address sender)
    {
        // We want to use the _msgSender() implementation of ERC2771ContextUpgradeable
        return super._msgSender();
    }

    /// @dev This is same as ERC2771ContextUpgradeable._msgData()
    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes calldata)
    {
        // We want to use the _msgData() implementation of ERC2771ContextUpgradeable
        return super._msgData();
    }
}
