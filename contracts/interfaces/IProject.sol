// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IDebtToken} from "./IDebtToken.sol";
import {IHomeFi} from "./IHomeFi.sol";
import {Tasks, Task, TaskStatus} from "../libraries/Tasks.sol";

/**
 * @title Interface for Project Contract for HomeFi v2.5.0

 * @notice contains the primary logic around construction project management. 
 * Onboarding contractors, fund escrow, and completion tracking are all managed here. 
 * Significant multi-signature and meta-transaction functionality is included here.
 */
interface IProject {
    /*******************************************************************************
     * ----------------------------------EVENTS----------------------------------- *
     *******************************************************************************/
    event ApproveHash(bytes32 _hash, address _signer);
    event HashUpdated(bytes _hash);
    event ContractorInvited(address indexed _newContractor);
    event ContractorDelegated(bool _bool);
    event LendToProject(uint256 _cost);
    event IncompleteAllocation();
    event TasksAdded(uint256[] _taskCosts, bytes[] _taskHashes);
    event TaskHashUpdated(uint256 _taskID, bytes _taskHash);
    event MultipleSCInvited(uint256[] _taskList, address[] _scList);
    event SingleSCInvited(uint256 _taskID, address _sc);
    event SCConfirmed(uint256[] _taskList);
    event TaskAllocated(uint256[] _taskIDs);
    event TaskComplete(uint256 _taskID);
    event ChangeOrderFee(uint256 _taskID, uint256 _newCost);
    event ChangeOrderSC(uint256 _taskID, address _sc);
    event AutoWithdrawn(uint256 _amount);

    /**
     * @notice initialize this contract with required parameters. This is initialized by HomeFi contract.

     * @dev modifier initializer

     * @param _currency address - currency for this project
     * @param _sender address - creator / builder for this project
     * @param _homeFiAddress address - HomeFi contract
     */
    function initialize(
        address _currency,
        address _sender,
        address _homeFiAddress
    ) external;

    /**
     * @notice Approve a hash on-chain.

     * @param _hash bytes32 - hash that is to be approved
     */
    function approveHash(bytes32 _hash) external;

    /**
     * @notice Adds a Contractor to project

     * @dev `_signature` must include builder and contractor (invited) signatures

     * @param _data bytes - encoded from:
     * - _contractor address - contractor address
     * - _projectAddress address - this project address, for signature security
     * @param _signature bytes representing signature on _data by required members.
     */
    function inviteContractor(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * @notice Builder can delegate his authorisation to the contractor.

     * @param _bool bool - bool to delegate builder authorisation to contractor.
     */
    function delegateContractor(bool _bool) external;

    /**
     * @notice Update project IPFS hash with adequate signatures.
     
     * @dev Check if signature is correct. If contractor is NOT added, check for only builder.
     * If contractor is added and NOT delegated, then check for builder and contractor.
     * If contractor is delegated, then check for contractor.
     
     * @param _data bytes - encoded from:
     * - _hash bytes - bytes encoded IPFS hash.
     * - _nonce uint256 - current hashChangeNonce
     * @param _signature bytes representing signature on _data by required members.
     */
    function updateProjectHash(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * @notice Allows lending in the project and allocates 50 tasks. 

     * @dev modifier nonReentrant
     * @dev if sender is builder then he fist must approve `_cost` amount of tokens to this contract.
     * @dev can only be called by builder or Community Contract (via lender).

     * @param _cost the cost that is needed to be lent
     */
    function lendToProject(uint256 _cost) external;

    /**
     * @notice Add tasks.

     * @dev Check if signature is correct. If contractor is NOT added, check for only builder.
     * If contractor is added and NOT delegated, then check for builder and contractor.
     * If contractor is delegated, then check for contractor.
     * @dev If the sender is disputes contract, then do not check for signatures

     * @param _data bytes - encoded from:
     * - _hash bytes[] - bytes IPFS hash of task details
     * - _taskCosts uint256[] - an array of cost for each task index
     * - _taskCount uint256 - current task count before adding these tasks. Can be fetched by taskCount.
     *   For signature security.
     * - _projectAddress address - the address of this contract. For signature security.
     * @param _signature bytes representing signature on _data by builder and contractor.
     */
    function addTasks(bytes calldata _data, bytes calldata _signature) external;

    /**
     * @notice Update IPFS hash for a particular task.

     * @dev If subcontractor is approved then check for signature using `checkSignatureTask`.
     * Else check for signature using `checkSignature`
     
     * @param _data bytes - encoded from:
     * - _taskHash bytes - IPFS hash of task details
     * - _nonce uint256 - current hashChangeNonce. For signature security.
     * - _taskID uint256 - task index
     * @param _signature bytes representing signature on _data by required members.
     */
    function updateTaskHash(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * @notice Invite subcontractors for existing tasks. This can be called by builder or contractor.

     * @dev This function internally calls _inviteSC.
     * _taskList must not have a task which already has approved subcontractor.

     * @param _taskList uint256[] - array the task index for which subcontractors needs to be assigned.
     * @param _scList uint256[] - array of addresses of subcontractor for the respective task index.
     */
    function inviteSC(uint256[] calldata _taskList, address[] calldata _scList)
        external;

    /**
     * @notice Accept invite as subcontractor for a multiple tasks.

     * @dev Subcontractor must be unapproved.

     * @param _taskList uint256[] - the task list of indexes for which sender wants to accept invite.
     */
    function acceptInviteSC(uint256[] calldata _taskList) external;

    /**
     * @notice Mark a task a complete and release subcontractor payment.

     * @dev Check for signature using `checkSignatureTask`.
     * Else sender must be disputes contract.

     * @param _data bytes - encoded from:
     * - _taskID uint256 - the index of task
     * - _projectAddress address - the address of this contract. For signature security.
     * @param _signature bytes representing signature on _data by required members.
     */
    function setComplete(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * @notice Recover any token sent mistakenly to this contract. Funds are transferred to builder account.

     * @dev If _tokenAddress is equal to this project currency, then we will first check is
     * all the tasks are complete

     * @param _tokenAddress address - the token user wants to recover.
     */
    function recoverTokens(address _tokenAddress) external;

    /**
     * @notice Change order to change a task's subcontractor, cost or both.

     * @dev modifier nonReentrant.
     * @dev Check for signature using `checkSignatureTask`.

     * @param _data bytes - encoded from:
     * - _taskID uint256 - index of the task
     * - _newSC address - address of new subcontractor.
     *   If do not want to replace subcontractor, then pass address of existing subcontractor.
     * - _newCost uint256 - new cost for the task.
     *   If do not want to change cost, then pass existing cost.
     * - _project address - address of project
     * @param _signature bytes representing signature on _data by required members.
     */
    function changeOrder(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * Raise a dispute to arbitrate & potentially enforce requested state changes
     *
     * @param _data bytes - encoded from:
     *   - _project address - address of this project
     *   - _task uint256 - task id (0 if none)
     *   - _actionType uint8 - action type
     *   - _actionData bytes - action data
     *   - _reason bytes - IPFS hash of the reason for dispute
     * @param _signature bytes - hash of _data signed by the address raising dispute
     */
    function raiseDispute(bytes calldata _data, bytes calldata _signature)
        external;

    /**
     * @notice allocates funds for unallocated tasks and mark them as allocated.
     
     * @dev this is by default called by lendToProject.
     * But when unallocated task count are beyond 50 then this is needed to be called externally.
     */
    function allocateFunds() external;

    /**
     * @notice Returns tasks details
     
     * @param _taskId uint256 - task index

     * @return taskCost uint256 - task cost
     * @return taskSubcontractor uint256 - task subcontractor
     * @return taskStatus uint256 - task status
     */
    function getTask(uint256 _taskId)
        external
        view
        returns (
            uint256 taskCost,
            address taskSubcontractor,
            TaskStatus taskStatus
        );

    /**
     * @notice Returns array of indexes of change ordered tasks
     
     * @return changeOrderTask uint256[] - of indexes of change ordered tasks
     */
    function changeOrderedTask()
        external
        view
        returns (uint256[] memory changeOrderTask);

    /**
     * @notice Returns cost of project. Project cost is sum of all task cost.

     * @return _cost uint256 - cost of project.
     */
    function projectCost() external view returns (uint256 _cost);

    /**
     * @notice returns Lifecycle statuses of a task

     * @param _taskID uint256 - task index

     * @return _alerts bool[3] - array of bool representing whether Lifecycle alert has been reached.
     * Lifecycle alerts- [None, TaskAllocated, SCConfirmed]
     */
    function getAlerts(uint256 _taskID)
        external
        view
        returns (bool[3] memory _alerts);

    /**
     * @notice checks trustedForwarder on HomeFi contract

     * @param _forwarder address of contract forwarding meta tx

     * @return bool true if `_forwarder` is trustedForwarder else false
     */
    function isTrustedForwarder(address _forwarder)
        external
        view
        returns (bool);

    /// @notice Returns homeFi NFT contract instance
    function homeFi() external view returns (IHomeFi);

    /// @notice Returns address of project currency
    function currency() external view returns (IDebtToken);

    /// @notice Returns lender fee inherited from HomeFi
    function lenderFee() external view returns (uint256);

    /// @notice Returns address of builder
    function builder() external view returns (address);

    /// @notice Returns version of project contract
    // solhint-disable-next-line func-name-mixedcase
    function VERSION() external view returns (uint256);

    /// @notice Returns address of invited contractor
    function contractor() external view returns (address);

    /// @notice Returns bool that indicated if contractor has accepted invite
    function contractorConfirmed() external view returns (bool);

    /// @notice Returns nonce that is used for signature security related to hash change
    function hashChangeNonce() external view returns (uint256);

    /// @notice Returns total amount lent in project
    function totalLent() external view returns (uint256);

    /// @notice Returns total amount allocated in project
    function totalAllocated() external view returns (uint256);

    /// @notice Returns task count/serial. Starts from 1.
    function taskCount() external view returns (uint256);

    /// @notice Returns bool indication if contractor is delegated
    function contractorDelegated() external view returns (bool);

    /// @notice Returns index of last allocated task
    function lastAllocatedTask() external view returns (uint256);

    /// @notice Returns index indicating last allocated task in array of changeOrderedTask
    function lastAllocatedChangeOrderTask() external view returns (uint256);

    /// @notice Returns mapping to keep track of all hashes (message or transaction) that have been approved by ANYONE
    function approvedHashes(address _signer, bytes32 _hash)
        external
        view
        returns (bool);
}
