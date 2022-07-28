// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IHomeFi} from "./IHomeFi.sol";
import {IProject} from "./IProject.sol";

/**
 * @title Interface for Dispute contract for HomeFi v2.5.0

 * @dev Module for raising disputes for arbitration within HomeFi projects
 */
interface IDisputes {
    /*******************************************************************************
     * -------------------------------ENUMERATIONS-------------------------------- *
     *******************************************************************************/

    // Status of a dispute
    enum Status {
        None,
        Active,
        Accepted,
        Rejected
    }

    // Determines how dispute action params are parsed and executed
    enum ActionType {
        None,
        TaskAdd,
        TaskChange,
        TaskPay
    }

    /*******************************************************************************
     * ----------------------------------STRUCTS---------------------------------- *
     *******************************************************************************/

    // Object storing details of disputes
    struct Dispute {
        Status status; // the ruling on the dispute (see Status enum for all possible cases)
        address project; // project the dispute occurred in
        uint256 taskID; // task the dispute occurred in
        address raisedBy; // user who raised the dispute
        ActionType actionType; // action taken on if dispute is accepted
        bytes actionData; // IPFS hash of off-chain dispute discussion
    }

    /*******************************************************************************
     * ----------------------------------EVENTS----------------------------------- *
     *******************************************************************************/

    event DisputeRaised(uint256 indexed _disputeID, bytes _reason);
    event DisputeResolved(
        uint256 indexed _disputeID,
        bool _ratified,
        bytes _judgement
    );
    event DisputeAttachmentAdded(
        uint256 indexed _disputeID,
        address _user,
        bytes _attachment
    );

    /**
     * @notice Initialize a new communities contract

     * @dev modifier initializer
     * @dev modifier nonZero with _homeFi

     * @param _homeFi address - address of main homeFi contract
     */
    function initialize(address _homeFi) external;

    /**
     * @notice Raise a new dispute

     * @dev modifier onlyProject

     * @param _data bytes
     *   - 0: project address, 1: task id (0 if none), 2: action disputeType, 3: action data, 5: ipfs cid of pdf
     *   - const types = ["address", "uint256", "uint8", "bytes", "bytes"]
     * @param _signature bytes - hash of _data signed by the address raising dispute
     */
    function raiseDispute(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * @notice Attach cid of arbitrary documents used to arbitrate disputes

     * @dev modifier resolvable with _disputeID

     * @param _disputeID uint256 - the uuid/serial of the dispute within this contract
     * @param _attachment bytes - the URI of the document being added
     */
    function attachDocument(uint256 _disputeID, bytes calldata _attachment)
        external;

    /**
     * @notice Arbitrate a dispute & execute accompanying enforcement logic to achieve desired project state

     * @dev modifier onlyAdmin
     * @dev modifier nonReentrant
     * @dev modifier resolvable with _disputeID

     * @param _disputeID uint256 - the uuid (serial) of the dispute in this contract
     * @param _judgement bytes - the URI hash of the document to be used to close the dispute
     * @param _ratify bool - true if status should be set to accepted, and false if rejected
     */
    function resolveDispute(
        uint256 _disputeID,
        bytes calldata _judgement,
        bool _ratify
    ) external;

    /**
     * @notice Asserts whether a given address is a related to dispute.
     * Else reverts.
     *
     * @param _project address - the project being queried for membership
     * @param _task uint256 - the index/serial of the task
     *  - if not querying for subcontractor, set as 0
     * @param _address address - the address being checked for membership
     */
    function assertMember(
        address _project,
        uint256 _task,
        address _address
    ) external;

    /**
     * @notice Checks trustedForwarder on HomeFi contract

     * @param _forwarder address - contract forwarding meta tx

     * @return bool - bool if _forwarder is trustedForwarder
     */
    function isTrustedForwarder(address _forwarder)
        external
        view
        returns (bool);

    /// @notice address of homeFi Contract
    function homeFi() external view returns (IHomeFi);

    /// @notice number of disputes
    function disputeCount() external view returns (uint256);

    /// @notice dispute by ID
    function disputes(uint256)
        external
        view
        returns (
            Status,
            address,
            uint256,
            address,
            ActionType,
            bytes memory
        );
}
