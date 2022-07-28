// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IDebtToken} from "./IDebtToken.sol";
import {IHomeFi} from "./IHomeFi.sol";

/**
 * @title Community Contract Interface for HomeFi v2.5.0
 
 * @notice Interface Module for coordinating lending groups on HomeFi protocol
 */
interface ICommunity {
    /*******************************************************************************
     * ----------------------------------STRUCTS---------------------------------- *
     *******************************************************************************/

    // Object storing data about project for a particular community
    struct ProjectDetails {
        // Percentage of interest rate of project.
        // The percentage must be multiplied with 10. Lowest being 0.1%.
        uint256 apr;
        uint256 lendingNeeded; // total lending requirement from the community
        // Total amount that has been transferred to a project from a community.
        // totalLent = lentAmount - lenderFee - anyRepayment.
        uint256 totalLent;
        uint256 publishFee; // fee required to be paid to request funds from community
        bool publishFeePaid; // boolean indicating if publish fee is paid
        uint256 lentAmount; // current principal lent to project (needs to be repaid by project's builder)
        uint256 interest; // total accrued interest on `lentAmount`
        uint256 lastTimestamp; // timestamp when last lending / repayment was made
    }

    // Object storing all data relevant to an lending community
    struct CommunityStruct {
        address owner; // owner of the community
        IDebtToken currency; // token currency of the community
        uint256 memberCount; // count of members in the community
        uint256 publishNonce; // unique nonce counter. Used for unique signature at `publishProject`.
        mapping(uint256 => address) members; // returns member address at particular member count. From index 0.
        mapping(address => bool) isMember; // returns bool if address is a community member
        mapping(address => ProjectDetails) projectDetails; // returns project specific details
    }

    /*******************************************************************************
     * ----------------------------------EVENTS----------------------------------- *
     *******************************************************************************/

    event RestrictedToAdmin(address account);
    event UnrestrictedToAdmin(address account);
    event CommunityAdded(
        uint256 _communityID,
        address indexed _owner,
        address indexed _currency,
        bytes _hash
    );
    event UpdateCommunityHash(uint256 _communityID, bytes _newHash);
    event MemberAdded(
        uint256 indexed _communityID,
        address indexed _member,
        bytes _hash
    );
    event ProjectPublished(
        uint256 indexed _communityID,
        address indexed _project,
        uint256 _apr,
        uint256 _publishFee,
        bool _publishFeePaid,
        bytes _hash
    );
    event ProjectUnpublished(
        uint256 indexed _communityID,
        address indexed _project
    );
    event PublishFeePaid(
        uint256 indexed _communityID,
        address indexed _project
    );
    event ToggleLendingNeeded(
        uint256 indexed _communityID,
        address indexed _project,
        uint256 _lendingNeeded
    );
    event LenderLent(
        uint256 indexed _communityID,
        address indexed _project,
        address indexed _lender,
        uint256 _cost,
        bytes _hash
    );
    event RepayLender(
        uint256 indexed _communityID,
        address indexed _project,
        address indexed _lender,
        uint256 _tAmount
    );
    event DebtReduced(
        uint256 indexed _communityID,
        address indexed _project,
        address indexed _lender,
        uint256 _tAmount,
        bytes _details
    );
    event DebtReducedByEscrow(address indexed _escrow);
    event ClaimedInterest(
        uint256 indexed _communityID,
        address indexed _project,
        address indexed _lender,
        uint256 _interestEarned
    );
    event ApproveHash(bytes32 _hash, address _signer);

    /**
     * @notice Initializes this contract

     * @dev modifier initializer
     * @dev modifier nonZero with `_homeFi`

     * @param _homeFi address - instance of main HomeFi contract.
     */
    function initialize(address _homeFi) external;

    /**
     * @notice Creates a new lending community on HomeFi

     * @param _hash bytes - IPFS hash with community details
     * @param _currency address - currency address supported by HomeFi
     */
    function createCommunity(bytes calldata _hash, address _currency) external;

    /**
     * @notice Update the internal identifying hash of a community (IPFS hash with community details)
     *
     * @param _communityID uint256 - the the uuid (serial) of the community
     * @param _hash bytes - the new hash to update the community hash to
     */
    function updateCommunityHash(uint256 _communityID, bytes calldata _hash)
        external;

    /**
     * @notice Add a new member to an lending community
     * Comprises of both request to join and join.

     * @param _data bytes - data encoded:
     * - _communityID uint256 - community count
     * - _memberAddr address - member address to add
     * - _messageHash bytes - IPFS hash of community application response or document urls
     * @param _signature bytes - _data signed by the community owner and new member
     */
    function addMember(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * @notice Add a new project to an lending community
     * If the project was already a part of any community, then that project will be first unpublished from that community
     * and then published to the new community.

     * @param _data bytes - data encoded:
     * - _communityID uint256 - the the uuid (serial) of the community being published to
     * - _project address - the project contract being added to the community for lending
     * - _apr uint256 - APR
     * - _publishFee uint256 - project publish fee. This fee is required to be paid before `toggleLendingNeeded` can be called.
     * - _publishNonce uint256 - the correct publishNonce for _communityID. This ensure the signatures are not reused.
     * - _messageHash bytes - IPFS hash of signed agreements document urls
     * @param _signature bytes - _data signed by the community owner and project builder
     */
    function publishProject(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * @notice Un-publish a project from a community.
     * Doing so, community cannot lent any more in the project (lendingNeeded = totalLent).
     * The builder cannot change lendingNeeded (request for funding), until re published.
     * The old lendings can be paid off by the builder

     * @dev modifier isPublishedToCommunity with `_communityID` and `_project`
     * @dev modifier onlyProjectBuilder `_project`

     * @param _communityID uint256 -  the the uuid (serial) of the community being unpublished from
     * @param _project address - the project contract being unpublished from the community
     */
    function unpublishProject(uint256 _communityID, address _project) external;

    /**
     * @notice A community's project home builder can call this function to pay one time project publish fee.
     * This fee is required to be paid before `toggleLendingNeeded` can be called. Hence before asking for any lending.
     
     * @dev modifier nonReentrant
     * @dev modifier isPublishToCommunity with `_communityID` and `_project`
     * @dev modifier onlyProjectBuilder with `_project`
     *
     * @param _communityID uint256 -  the the uuid (serial) of the community being unpublished from
     * @param _project address - the project contract being unpublished from the community
     */
    function payPublishFee(uint256 _communityID, address _project) external;

    /**
     * @notice A community's project builder can call this function to increase or decrease lending needed from community.

     * @dev modifier isPublishToCommunity with `_communityID` and `_project`
     * @dev modifier onlyProjectBuilder with `_project`
     *
     * @param _communityID uint256 -  the the uuid (serial) of the community being unpublished from
     * @param _project address - the project contract being unpublished from the community
     * @param _lendingNeeded uint256 - new lending needed from project
     */
    function toggleLendingNeeded(
        uint256 _communityID,
        address _project,
        uint256 _lendingNeeded
    ) external;

    /**
     * @notice As a community member, lent in a project and create new HomeFi debt tokens
     * This is where funds flow into contracts for lenders

     * @dev modifier nonReentrant
     * @dev modifier isPublishToCommunity with `_communityID` and `_project`
     * @dev users MUST call approve on respective token contracts to the community contract first

     * @param _communityID uint256 - the the uuid (serial) of the community
     * @param _project address - the address of the deployed project contract
     * @param _lending uint256 - the number of tokens of the community currency to lent
     * @param _hash bytes - IPFS hash of signed agreements document urls
     */
    function lendToProject(
        uint256 _communityID,
        address _project,
        uint256 _lending,
        bytes calldata _hash
    ) external;

    /**
     * @notice As a builder, repay an lender for their lending with interest
     * This is where funds flow out of contracts for lenders

     * @dev modifier nonReentrant
     * @dev modifier onlyProjectBuilder
     * @dev users MUST call approve on respective token contracts for the community contract first

     * @param _communityID uint256 - the the uuid of the community
     * @param _project address - the address of the deployed project contract
     * @param _repayAmount uint256 - the amount of funds repaid to the lender, in the project currency
     */
    function repayLender(
        uint256 _communityID,
        address _project,
        uint256 _repayAmount
    ) external;

    /**
     * @notice If the repayment was done off platform then the lender can mark their debt paid.
     
     * @param _communityID uint256 - the uuid of the community
     * @param _project address - the address of the deployed project contract
     * @param _repayAmount uint256 - the amount of funds repaid to the lender, in the project currency
     * @param _details bytes - IPFS hash of details on why debt is reduced (off chain documents or images)
     */
    function reduceDebt(
        uint256 _communityID,
        address _project,
        uint256 _repayAmount,
        bytes calldata _details
    ) external;

    /**
     * @notice Approve a hash on-chain.
     * @param _hash bytes32 - hash that is to be approved
     */
    function approveHash(bytes32 _hash) external;

    /**
     * @notice Reduce debt using escrow. Here lender can come in
     * terms with the builder and agent to reduce debt.
     *
     * @param _data bytes - data encoded:
     * _communityID uint256 - community index associated with lending
     * _builder address - builder address associated with lending
     * _lender address - lender address associated with lending
     * _agent address - agent address associated with an external agent
     * _project address - project address associated with lending
     * _repayAmount uint256 - amount to repay
     * _details bytes - IPFS hash
     * @param _signature bytes - _data signed by lender, builder and agent
     */
    function escrow(bytes calldata _data, bytes calldata _signature) external;

    /**
     * @notice Pauses community creation when sender is not HomeFi admin.

     * @dev modifier onlyHomeFiAdmin
     */
    function restrictToAdmin() external;

    /**
     * @notice Un Pauses community creation. So anyone can create a community.
  
     * @dev modifier onlyHomeFiAdmin
     */
    function unrestrictToAdmin() external;

    /**
     * @notice Pauses all token transfers.

     * @dev modifier onlyHomeFiAdmin
     * See {ERC20Pausable} and {Pausable-_pause}.
     *
     * Requirements:
     *
     * - the caller must have the `PAUSER_ROLE`.
     */
    function pause() external;

    /**
     * @notice Unpauses all token transfers.
     
     * @dev modifier onlyHomeFiAdmin
     * See {ERC20Pausable} and {Pausable-_unpause}.
     *
     * Requirements:
     *
     * - the caller must have the `PAUSER_ROLE`.
     */
    function unpause() external;

    /**
     * @notice Return community specific information
     *
     * @param _communityID uint256 - the uuid (serial) of the community to query

     * @return owner address - owner of the community
     * @return currency address - token currency of the community
     * @return memberCount uint256 - count of members in the community
     * @return publishNonce uint256 - unique nonce counter. Used for unique signature at `publishProject`.
     */
    function communities(uint256 _communityID)
        external
        view
        returns (
            address owner,
            address currency,
            uint256 memberCount,
            uint256 publishNonce
        );

    /**
     * Return all members of a specific community
     *
     * @param _communityID uint256 - the uuid (serial) of the community to query
     * @return _members address[] - array of all member accounts
     */
    function members(uint256 _communityID)
        external
        view
        returns (address[] memory _members);

    /**
     * Return all info about a specific project from the community
     *
     * @param _communityID uint256 - the uuid (serial) of the community to query
     * @param _project address - the address of the project published in the community

     * @return projectApr uint256 - interest rates with index relating to _projects
     * @return lendingNeeded uint256 - amounts needed by projects before lending completes with index relating to _projects
     * @return totalLent uint256 - amounts by project total lent.
     * @return publishFee uint256 - project publish fee.
     * @return publishFeePaid bool - is project publish fee paid by project builder
     * @return lentAmount uint256 - current principal lent to project's builder
     * @return interest uint256 - total accrued interest last collected at `lastTimestamp`.
     * @return lastTimestamp uint256 - time when last lending / repayment was made
     */
    function projectDetails(uint256 _communityID, address _project)
        external
        view
        returns (
            uint256 projectApr,
            uint256 lendingNeeded,
            uint256 totalLent,
            uint256 publishFee,
            bool publishFeePaid,
            uint256 lentAmount,
            uint256 interest,
            uint256 lastTimestamp
        );

    /**
     * @notice Calculate the payout for a given lender on their lendings as queried

     * @dev modifier onlyProjectBuilder
     * @dev modifier nonZero(_lender)

     * @param _communityID uint256 - the the uuid (serial) of the community where the lending took place
     * @param _project address - the address of the deployed project contract

     * @return _totalToReturn uint256 - the amount lent by _address + interest to be paid (the amount of tokens reclaimed)
     * @return _lent uint256 - the amount lent by _address
     * @return _totalInterest uint256 - total interest to be paid to _lender
     * @return _unclaimedInterest uint256 - new interest yet to be claimed
     */
    function returnToLender(uint256 _communityID, address _project)
        external
        view
        returns (
            uint256 _totalToReturn,
            uint256 _lent,
            uint256 _totalInterest,
            uint256 _unclaimedInterest
        );

    /**
     * @notice checks trustedForwarder on HomeFi contract

     * @param _forwarder address of contract forwarding meta tx
     */
    function isTrustedForwarder(address _forwarder)
        external
        view
        returns (bool);

    /// @notice Returns address of homeFi Contract
    function homeFi() external view returns (IHomeFi);

    /// @notice Returns bool for community creation pause
    function restrictedToAdmin() external view returns (bool);

    /// @notice Returns community count. Starts from 1.
    function communityCount() external view returns (uint256);

    /// @notice Returns community id in which `_projectAddress` is published.
    function projectPublished(address _projectAddress)
        external
        view
        returns (uint256 _communityID);

    /// @notice Returns mapping to keep track of all hashes (message or transaction) that have been approved by ANYONE
    function approvedHashes(address _signer, bytes32 _hash)
        external
        view
        returns (bool);
}
