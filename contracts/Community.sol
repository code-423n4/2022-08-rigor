// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IHomeFi} from "./interfaces/IHomeFi.sol";
import {IProject} from "./interfaces/IProject.sol";
import {ICommunity, IDebtToken} from "./interfaces/ICommunity.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ContextUpgradeable, ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {SignatureDecoder} from "./libraries/SignatureDecoder.sol";

/* solhint-disable not-rely-on-time */

/**
 * @title Community Contract for HomeFi v2.5.0
 
 * @notice Module for coordinating lending groups on HomeFi protocol
 */
contract Community is
    ICommunity,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    ERC2771ContextUpgradeable
{
    // Using SafeERC20Upgradeable library for IDebtToken
    using SafeERC20Upgradeable for IDebtToken;

    /*******************************************************************************
     * ---------------------FIXED INTERNAL STORED PROPERTIES---------------------- *
     *******************************************************************************/
    address internal tokenCurrency1;
    address internal tokenCurrency2;
    address internal tokenCurrency3;

    /*******************************************************************************
     * --------------------VARIABLE INTERNAL STORED PROPERTIES-------------------- *
     *******************************************************************************/

    mapping(uint256 => CommunityStruct) internal _communities;

    /*******************************************************************************
     * ----------------------FIXED PUBLIC STORED PROPERTIES----------------------- *
     *******************************************************************************/

    /// @inheritdoc ICommunity
    IHomeFi public override homeFi;

    /*******************************************************************************
     * ---------------------VARIABLE PUBLIC STORED PROPERTIES--------------------- *
     *******************************************************************************/

    /// @inheritdoc ICommunity
    bool public override restrictedToAdmin;
    /// @inheritdoc ICommunity
    uint256 public override communityCount;
    /// @inheritdoc ICommunity
    mapping(address => uint256) public override projectPublished;
    /// @inheritdoc ICommunity
    mapping(address => mapping(bytes32 => bool)) public override approvedHashes;

    /*******************************************************************************
     * ---------------------------------MODIFIERS--------------------------------- *
     *******************************************************************************/

    modifier nonZero(address _address) {
        // Revert if _address zero address (0x00) (invalid)
        require(_address != address(0), "Community::0 address");
        _;
    }

    modifier onlyHomeFiAdmin() {
        // Revert if sender is not homeFi admin
        require(_msgSender() == homeFi.admin(), "Community::!admin");
        _;
    }

    modifier isPublishedToCommunity(uint256 _communityID, address _project) {
        // Revert if _project is not published to _communityID
        require(
            projectPublished[_project] == _communityID,
            "Community::!published"
        );
        _;
    }

    modifier onlyProjectBuilder(address _project) {
        // Revert if sender is not _project builder
        require(
            _msgSender() == IProject(_project).builder(),
            "Community::!Builder"
        );
        _;
    }

    /*******************************************************************************
     * ---------------------------EXTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /// @inheritdoc ICommunity
    function initialize(address _homeFi)
        external
        override
        initializer
        nonZero(_homeFi)
    {
        // Initialize pausable. Set pause to false;
        __Pausable_init();

        // Initialize variables
        homeFi = IHomeFi(_homeFi);
        tokenCurrency1 = homeFi.tokenCurrency1();
        tokenCurrency2 = homeFi.tokenCurrency2();
        tokenCurrency3 = homeFi.tokenCurrency3();

        // Community creation is paused for non admin by default paused
        restrictedToAdmin = true;
    }

    /// @inheritdoc ICommunity
    function createCommunity(bytes calldata _hash, address _currency)
        external
        override
        whenNotPaused
    {
        // Local variable for sender. For gas saving.
        address _sender = _msgSender();

        // Revert if community creation is paused or sender is not HomeFi admin
        require(
            !restrictedToAdmin || _sender == homeFi.admin(),
            "Community::!admin"
        );

        // Revert if currency is not supported by HomeFi
        homeFi.validCurrency(_currency);

        // Increment community counter
        communityCount++;

        // Store community details
        CommunityStruct storage _community = _communities[communityCount];
        _community.owner = _sender;
        _community.currency = IDebtToken(_currency);
        _community.memberCount = 1;
        _community.members[0] = _sender;
        _community.isMember[_sender] = true;

        emit CommunityAdded(communityCount, _sender, _currency, _hash);
    }

    /// @inheritdoc ICommunity
    function updateCommunityHash(uint256 _communityID, bytes calldata _hash)
        external
        override
    {
        // Revert if sender is not _communityID owner
        require(
            _communities[_communityID].owner == _msgSender(),
            "Community::!owner"
        );

        // Emit event if _hash. This way this hash needs not be stored in memory.
        emit UpdateCommunityHash(_communityID, _hash);
    }

    /// @inheritdoc ICommunity
    function addMember(bytes calldata _data, bytes calldata _signature)
        external
        virtual
        override
    {
        // Compute hash from bytes
        bytes32 _hash = keccak256(_data);

        // Decode params from _data
        (
            uint256 _communityID,
            address _newMemberAddr,
            bytes memory _messageHash
        ) = abi.decode(_data, (uint256, address, bytes));

        CommunityStruct storage _community = _communities[_communityID];

        // check signatures
        checkSignatureValidity(_community.owner, _hash, _signature, 0); // must be community owner
        checkSignatureValidity(_newMemberAddr, _hash, _signature, 1); // must be new member

        // Revert if new member already exists
        require(
            !_community.isMember[_newMemberAddr],
            "Community::Member Exists"
        );

        // Store updated community details
        uint256 _memberCount = _community.memberCount;
        _community.memberCount = _memberCount + 1;
        _community.members[_memberCount] = _newMemberAddr;
        _community.isMember[_newMemberAddr] = true;

        emit MemberAdded(_communityID, _newMemberAddr, _messageHash);
    }

    /// @inheritdoc ICommunity
    function publishProject(bytes calldata _data, bytes calldata _signature)
        external
        virtual
        override
        whenNotPaused
    {
        // Compute hash from bytes
        bytes32 _hash = keccak256(_data);

        // Decode params from _data
        (
            uint256 _communityID,
            address _project,
            uint256 _apr,
            uint256 _publishFee,
            uint256 _publishNonce,
            bytes memory _messageHash
        ) = abi.decode(
                _data,
                (uint256, address, uint256, uint256, uint256, bytes)
            );

        // Local instance of community and community  project details. For saving gas.
        CommunityStruct storage _community = _communities[_communityID];
        ProjectDetails storage _communityProject = _community.projectDetails[
            _project
        ];

        // Revert if decoded nonce is incorrect. This indicates wrong _data.
        require(
            _publishNonce == _community.publishNonce,
            "Community::invalid publishNonce"
        );

        // Reverts if _project not originated from HomeFi
        require(homeFi.isProjectExist(_project), "Community::Project !Exists");

        // Local instance of variables. For saving gas.
        IProject _projectInstance = IProject(_project);
        address _builder = _projectInstance.builder();

        // Revert if project builder is not community member
        require(_community.isMember[_builder], "Community::!Member");

        // Revert if project currency does not match community currency
        require(
            _projectInstance.currency() == _community.currency,
            "Community::!Currency"
        );

        // check signatures
        checkSignatureValidity(_community.owner, _hash, _signature, 0); // must be community owner
        checkSignatureValidity(_builder, _hash, _signature, 1); // must be project builder

        // If already published then unpublish first
        if (projectPublished[_project] > 0) {
            _unpublishProject(_project);
        }

        // Store updated details
        _community.publishNonce = ++_community.publishNonce;
        _communityProject.apr = _apr;
        _communityProject.publishFee = _publishFee;
        projectPublished[_project] = _communityID;

        // If _publishFee is zero than mark publish fee as paid
        if (_publishFee == 0) _communityProject.publishFeePaid = true;

        emit ProjectPublished(
            _communityID,
            _project,
            _apr,
            _publishFee,
            _communityProject.publishFeePaid,
            _messageHash
        );
    }

    /// @inheritdoc ICommunity
    function unpublishProject(uint256 _communityID, address _project)
        external
        override
        whenNotPaused
        isPublishedToCommunity(_communityID, _project)
        onlyProjectBuilder(_project)
    {
        // Call internal function to unpublish project
        _unpublishProject(_project);
    }

    /// @inheritdoc ICommunity
    function payPublishFee(uint256 _communityID, address _project)
        external
        override
        nonReentrant
        whenNotPaused
        isPublishedToCommunity(_communityID, _project)
        onlyProjectBuilder(_project)
    {
        // Local instance of variables. For saving gas.
        CommunityStruct storage _community = _communities[_communityID];
        ProjectDetails storage _communityProject = _community.projectDetails[
            _project
        ];

        // Revert if publish fee already paid
        require(
            !_communityProject.publishFeePaid,
            "Community::publish fee paid"
        );

        // Store updated detail
        _communityProject.publishFeePaid = true;

        // Transfer publishFee to community owner (lender)
        _community.currency.safeTransferFrom(
            _msgSender(),
            _community.owner,
            _communityProject.publishFee
        );

        emit PublishFeePaid(_communityID, _project);
    }

    /// @inheritdoc ICommunity
    function toggleLendingNeeded(
        uint256 _communityID,
        address _project,
        uint256 _lendingNeeded
    )
        external
        override
        whenNotPaused
        isPublishedToCommunity(_communityID, _project)
        onlyProjectBuilder(_project)
    {
        // Local instance of variable. For saving gas.
        ProjectDetails storage _communityProject = _communities[_communityID]
            .projectDetails[_project];

        // Revert if publish fee not paid
        require(
            _communityProject.publishFeePaid,
            "Community::publish fee !paid"
        );

        // Revert if _lendingNeeded is more than projectCost or less than what is already lent
        require(
            _lendingNeeded >= _communityProject.totalLent &&
                _lendingNeeded <= IProject(_project).projectCost(),
            "Community::invalid lending"
        );

        // Store updated detail
        _communityProject.lendingNeeded = _lendingNeeded;

        emit ToggleLendingNeeded(_communityID, _project, _lendingNeeded);
    }

    /// @inheritdoc ICommunity
    function lendToProject(
        uint256 _communityID,
        address _project,
        uint256 _lendingAmount,
        bytes calldata _hash
    )
        external
        virtual
        override
        nonReentrant
        whenNotPaused
        isPublishedToCommunity(_communityID, _project)
    {
        // Local instance of variable. For saving gas.
        address _sender = _msgSender();

        // Revert if sender is not community owner.
        // Only community owner can lend.
        require(
            _sender == _communities[_communityID].owner,
            "Community::!owner"
        );

        // Local instance of variable. For saving gas.
        IProject _projectInstance = IProject(_project);

        // Calculate lenderFee
        uint256 _lenderFee = (_lendingAmount * _projectInstance.lenderFee()) /
            (_projectInstance.lenderFee() + 1000);

        // Calculate amount going to project. Lending amount - lending fee.
        uint256 _amountToProject = _lendingAmount - _lenderFee;

        // Revert if _amountToProject is not within further investment needed.
        require(
            _amountToProject <=
                _communities[_communityID]
                    .projectDetails[_project]
                    .lendingNeeded -
                    _communities[_communityID]
                        .projectDetails[_project]
                        .totalLent,
            "Community::lending>needed"
        );

        // Local instance of variable. For saving gas.
        IDebtToken _currency = _communities[_communityID].currency;
        IDebtToken _wrappedToken = IDebtToken(
            homeFi.wrappedToken(address(_currency))
        );

        // Update investment in Project
        _projectInstance.lendToProject(_amountToProject);

        // Update total lent by lender
        _communities[_communityID]
            .projectDetails[_project]
            .totalLent += _amountToProject;

        // First claim interest if principal lent > 0
        if (
            _communities[_communityID].projectDetails[_project].lentAmount > 0
        ) {
            claimInterest(_communityID, _project, _wrappedToken);
        }

        // Increment lent principal
        _communities[_communityID]
            .projectDetails[_project]
            .lentAmount += _lendingAmount;

        // Update lastTimestamp
        _communities[_communityID]
            .projectDetails[_project]
            .lastTimestamp = block.timestamp;

        // Transfer _lenderFee to HomeFi treasury from lender account
        _currency.safeTransferFrom(_msgSender(), homeFi.treasury(), _lenderFee);

        // Transfer _amountToProject to _project from lender account
        _currency.safeTransferFrom(_msgSender(), _project, _amountToProject);

        // Mint new _lendingAmount amount wrapped token to lender
        _wrappedToken.mint(_sender, _lendingAmount);

        emit LenderLent(_communityID, _project, _sender, _lendingAmount, _hash);
    }

    /// @inheritdoc ICommunity
    function repayLender(
        uint256 _communityID,
        address _project,
        uint256 _repayAmount
    )
        external
        virtual
        override
        nonReentrant
        whenNotPaused
        onlyProjectBuilder(_project)
    {
        // Internally call reduce debt
        _reduceDebt(_communityID, _project, _repayAmount, "0x");

        // Local instance of variable. For saving gas.
        address _lender = _communities[_communityID].owner;

        // Transfer repayment to lender
        _communities[_communityID].currency.safeTransferFrom(
            _msgSender(),
            _lender,
            _repayAmount
        );

        emit RepayLender(_communityID, _project, _lender, _repayAmount);
    }

    /// @inheritdoc ICommunity
    function reduceDebt(
        uint256 _communityID,
        address _project,
        uint256 _repayAmount,
        bytes memory _details
    ) external virtual override whenNotPaused {
        // Revert if sender is not _communityID owner (lender)
        require(
            _msgSender() == _communities[_communityID].owner,
            "Community::!Owner"
        );

        // Internal call to reduce debt
        _reduceDebt(_communityID, _project, _repayAmount, _details);
    }

    /// @inheritdoc ICommunity
    function approveHash(bytes32 _hash) external virtual override {
        // allowing anyone to sign, as its hard to add restrictions here
        approvedHashes[_msgSender()][_hash] = true;

        emit ApproveHash(_hash, _msgSender());
    }

    /// @inheritdoc ICommunity
    function escrow(bytes calldata _data, bytes calldata _signature)
        external
        virtual
        override
        whenNotPaused
    {
        // Decode params from _data
        (
            uint256 _communityID,
            address _builder,
            address _lender,
            address _agent,
            address _project,
            uint256 _repayAmount,
            bytes memory _details
        ) = abi.decode(
                _data,
                (uint256, address, address, address, address, uint256, bytes)
            );

        // Compute hash from bytes
        bytes32 _hash = keccak256(_data);

        // Local instance of variable. For saving gas.
        IProject _projectInstance = IProject(_project);

        // Revert if decoded builder is not decoded project's builder
        require(_builder == _projectInstance.builder(), "Community::!Builder");

        // Revert if decoded _communityID's owner is not decoded _lender
        require(
            _lender == _communities[_communityID].owner,
            "Community::!Owner"
        );

        // check signatures
        checkSignatureValidity(_lender, _hash, _signature, 0); // must be lender
        checkSignatureValidity(_builder, _hash, _signature, 1); // must be builder
        checkSignatureValidity(_agent, _hash, _signature, 2); // must be agent or escrow

        // Internal call to reduce debt
        _reduceDebt(_communityID, _project, _repayAmount, _details);
        emit DebtReducedByEscrow(_agent);
    }

    /// @inheritdoc ICommunity
    function restrictToAdmin() external override onlyHomeFiAdmin {
        // Revert if already restricted to admin
        require(!restrictedToAdmin, "Community::restricted");

        // Disable community creation for non admins
        restrictedToAdmin = true;

        emit RestrictedToAdmin(_msgSender());
    }

    /// @inheritdoc ICommunity
    function unrestrictToAdmin() external override onlyHomeFiAdmin {
        // Revert if already unrestricted to admin
        require(restrictedToAdmin, "Community::!restricted");

        // Allow community creation for all
        restrictedToAdmin = false;

        emit UnrestrictedToAdmin(_msgSender());
    }

    /// @inheritdoc ICommunity
    function pause() external override onlyHomeFiAdmin {
        _pause();
    }

    /// @inheritdoc ICommunity
    function unpause() external override onlyHomeFiAdmin {
        _unpause();
    }

    /*******************************************************************************
     * ------------------------------EXTERNAL VIEWS------------------------------- *
     *******************************************************************************/

    /// @inheritdoc ICommunity
    function communities(uint256 _communityID)
        external
        view
        override
        returns (
            address owner,
            address currency,
            uint256 memberCount,
            uint256 publishNonce
        )
    {
        CommunityStruct storage _community = _communities[_communityID];

        owner = _community.owner;
        currency = address(_community.currency);
        memberCount = _community.memberCount;
        publishNonce = _community.publishNonce;
    }

    /// @inheritdoc ICommunity
    function members(uint256 _communityID)
        external
        view
        virtual
        override
        returns (address[] memory)
    {
        // Initiate empty equal equal to member count length
        address[] memory _members = new address[](
            _communities[_communityID].memberCount
        );

        // Append member addresses in _members array
        for (uint256 i = 0; i < _communities[_communityID].memberCount; i++) {
            _members[i] = _communities[_communityID].members[i];
        }

        return _members;
    }

    /// @inheritdoc ICommunity
    function projectDetails(uint256 _communityID, address _project)
        external
        view
        virtual
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            uint256,
            uint256,
            uint256
        )
    {
        ProjectDetails storage _communityProject = _communities[_communityID]
            .projectDetails[_project];

        return (
            _communityProject.apr,
            _communityProject.lendingNeeded,
            _communityProject.totalLent,
            _communityProject.publishFee,
            _communityProject.publishFeePaid,
            _communityProject.lentAmount,
            _communityProject.interest,
            _communityProject.lastTimestamp
        );
    }

    /*******************************************************************************
     * -------------------------------PUBLIC VIEWS-------------------------------- *
     *******************************************************************************/

    /// @inheritdoc ICommunity
    function returnToLender(uint256 _communityID, address _project)
        public
        view
        override
        returns (
            uint256, // principal + interest
            uint256, // principal
            uint256, // total interest
            uint256 // unclaimedInterest
        )
    {
        // Local instance of variables. For saving gas.
        ProjectDetails storage _communityProject = _communities[_communityID]
            .projectDetails[_project];
        uint256 _lentAmount = _communityProject.lentAmount;

        // Calculate number of days difference current and last timestamp
        uint256 _noOfDays = (block.timestamp -
            _communityProject.lastTimestamp) / 86400; // 24*60*60

        /// Interest formula = (principal * APR * days) / (365 * 1000)
        // prettier-ignore
        uint256 _unclaimedInterest = 
                _lentAmount *
                _communities[_communityID].projectDetails[_project].apr *
                _noOfDays /
                365000;

        // Old (already rTokens claimed) + new interest
        uint256 _totalInterest = _unclaimedInterest +
            _communityProject.interest;

        return (
            _lentAmount + _totalInterest,
            _lentAmount,
            _totalInterest,
            _unclaimedInterest
        );
    }

    /// @inheritdoc ICommunity
    function isTrustedForwarder(address _forwarder)
        public
        view
        override(ERC2771ContextUpgradeable, ICommunity)
        returns (bool)
    {
        return homeFi.isTrustedForwarder(_forwarder);
    }

    /*******************************************************************************
     * ---------------------------INTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /**
     * @dev internal function for `unpublishProject`
     * @param _project address - project address to unpublish
     */
    function _unpublishProject(address _project) internal {
        // Locally store old community of published project
        uint256 formerCommunityId = projectPublished[_project];

        // Local instance of variable. For saving gas.
        ProjectDetails storage _communityProject = _communities[
            formerCommunityId
        ].projectDetails[_project];

        // Reduce lending needed to total lent. So no more investment can be made to this project.
        _communityProject.lendingNeeded = _communityProject.totalLent;

        // Mark project as unpublished.
        delete projectPublished[_project];

        // Set public fee paid to false.
        // So if this project is published again to this community,
        // then this fee will be required to be paid again.
        _communityProject.publishFeePaid = false;

        emit ProjectUnpublished(formerCommunityId, _project);
    }

    /**
     * @dev Internal function for reducing debt

     * @param _communityID uint256 - the the uuid of the community
     * @param _project address - the address of the deployed project contract
     * @param _repayAmount uint256 - the amount of funds repaid to the lender, in the project currency
     * @param _details bytes - some details on why debt is reduced (off chain documents or images)
     */
    function _reduceDebt(
        uint256 _communityID,
        address _project,
        uint256 _repayAmount,
        bytes memory _details
    ) internal virtual {
        // Revert if repayment amount is zero.
        require(_repayAmount > 0, "Community::!repay");

        // Local instance of variables. For saving gas.
        CommunityStruct storage _community = _communities[_communityID];
        ProjectDetails storage _communityProject = _community.projectDetails[
            _project
        ];
        address _lender = _community.owner;

        // Find wrapped token for community currency
        IDebtToken _wrappedToken = IDebtToken(
            homeFi.wrappedToken(address(_community.currency))
        );

        // Claim interest on existing investments
        claimInterest(_communityID, _project, _wrappedToken);

        // Local instance of variables. For saving gas.
        uint256 _lentAmount = _communityProject.lentAmount;
        uint256 _interest = _communityProject.interest;

        if (_repayAmount > _interest) {
            // If repayment amount is greater than interest then
            // set lent = lent + interest - repayment.
            // And set interest = 0.
            uint256 _lentAndInterest = _lentAmount + _interest;

            // Revert if repayment amount is greater than sum of lent and interest.
            require(_lentAndInterest >= _repayAmount, "Community::!Liquid");
            _interest = 0;
            _lentAmount = _lentAndInterest - _repayAmount;
        } else {
            // If repayment amount is lesser than interest, then set
            // interest = interest - repayment
            _interest -= _repayAmount;
        }

        // Update community  project details
        _communityProject.lentAmount = _lentAmount;
        _communityProject.interest = _interest;

        // Burn _repayAmount amount wrapped token from lender
        _wrappedToken.burn(_lender, _repayAmount);

        emit DebtReduced(
            _communityID,
            _project,
            _lender,
            _repayAmount,
            _details
        );
    }

    /**
     * @dev claim interest of lender

     * @param _communityID uint256 - uuid of community the project is held in
     * @param _project address - address of project where debt/ loan is held
     * @param _wrappedToken address - debt token lender is claiming
     */
    function claimInterest(
        uint256 _communityID,
        address _project,
        IDebtToken _wrappedToken
    ) internal {
        // Calculate new interest
        (, , uint256 _interest, uint256 _interestEarned) = returnToLender(
            _communityID,
            _project
        );

        // Local instance of variables. For saving gas.
        address _lender = _communities[_communityID].owner;
        ProjectDetails storage _communityProject = _communities[_communityID]
            .projectDetails[_project];

        if (_interestEarned > 0) {
            // If any new interest is to be claimed.

            // Increase total interest with new interest to be claimed.
            _communityProject.interest = _interest;

            // Update lastTimestamp to current time.
            _communityProject.lastTimestamp = block.timestamp;

            // Burn _interestEarned amount wrapped token to lender
            _wrappedToken.mint(_lender, _interestEarned);

            emit ClaimedInterest(
                _communityID,
                _project,
                _lender,
                _interestEarned
            );
        }
    }

    /**
     * @dev Internal function for checking signature validity
     * @dev checks if the signature is approved or recovered, if not it reverts.


     * @param _address address - address checked for validity
     * @param _hash bytes32 - hash for which the signature is recovered
     * @param _signature bytes - signatures
     * @param _signatureIndex uint256 - index at which the signature should be present
     */
    function checkSignatureValidity(
        address _address,
        bytes32 _hash,
        bytes memory _signature,
        uint256 _signatureIndex
    ) internal virtual {
        // Decode signer
        address _recoveredSignature = SignatureDecoder.recoverKey(
            _hash,
            _signature,
            _signatureIndex
        );

        // Revert if decoded signer does not match expected address
        // Or if hash is not approved by the expected address.
        require(
            _recoveredSignature == _address || approvedHashes[_address][_hash],
            "Community::invalid signature"
        );

        // Delete from approvedHash. So that signature cannot be reused.
        delete approvedHashes[_address][_hash];
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
