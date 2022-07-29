// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IHomeFi} from "./interfaces/IHomeFi.sol";
import {IProject} from "./interfaces/IProject.sol";
import {IDisputes} from "./interfaces/IDisputes.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ContextUpgradeable, ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {SignatureDecoder} from "./libraries/SignatureDecoder.sol";

/**
 * @title Disputes Contract for HomeFi v2.5.0

 * @dev Module for raising disputes for arbitration within HomeFi projects
 */
contract Disputes is
    IDisputes,
    ReentrancyGuardUpgradeable,
    ERC2771ContextUpgradeable
{
    /*******************************************************************************
     * -------------------------PUBLIC STORED PROPERTIES-------------------------- *
     *******************************************************************************/

    /// @inheritdoc IDisputes
    IHomeFi public override homeFi;
    /// @inheritdoc IDisputes
    uint256 public override disputeCount; //starts from 0
    /// @inheritdoc IDisputes
    mapping(uint256 => Dispute) public override disputes;

    /*******************************************************************************
     * ---------------------------------MODIFIERS--------------------------------- *
     *******************************************************************************/

    modifier nonZero(address _address) {
        // Revert if _address zero address (0x00)
        require(_address != address(0), "Disputes::0 address");
        _;
    }

    modifier onlyAdmin() {
        // Revert if sender is not HomeFi admin
        // Only HomeFi admin can resolve dispute
        require(homeFi.admin() == _msgSender(), "Disputes::!Admin");
        _;
    }

    modifier onlyProject() {
        // Revert if project not originated of HomeFi
        require(homeFi.isProjectExist(_msgSender()), "Disputes::!Project");
        _;
    }

    /**
     * Affirm that a given dispute is currently resolvable
     * @param _disputeID uint256 - the serial/id of the dispute
     */
    modifier resolvable(uint256 _disputeID) {
        require(
            _disputeID < disputeCount &&
                disputes[_disputeID].status == Status.Active,
            "Disputes::!Resolvable"
        );
        _;
    }

    /*******************************************************************************
     * ---------------------------EXTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /// @inheritdoc IDisputes
    function initialize(address _homeFi)
        external
        override
        initializer
        nonZero(_homeFi)
    {
        homeFi = IHomeFi(_homeFi);
    }

    /// @inheritdoc IDisputes
    function raiseDispute(bytes calldata _data, bytes calldata _signature)
        external
        override
        onlyProject
    {
        // Recover signer from signature
        address _signer = SignatureDecoder.recoverKey(
            keccak256(_data),
            _signature,
            0
        );

        // Decode params from _data
        (
            address _project,
            uint256 _taskID,
            uint8 _actionType,
            bytes memory _actionData,
            bytes memory _reason
        ) = abi.decode(_data, (address, uint256, uint8, bytes, bytes));

        // Revert if _actionType is invalid
        require(
            _actionType > 0 && _actionType <= uint8(ActionType.TaskPay),
            "Disputes::!ActionType"
        );

        // Store dispute details
        Dispute storage _dispute = disputes[disputeCount];
        _dispute.status = Status.Active;
        _dispute.project = _project;
        _dispute.taskID = _taskID;
        _dispute.raisedBy = _signer;
        _dispute.actionType = ActionType(_actionType);
        _dispute.actionData = _actionData;

        // Increment dispute counter and emit event
        emit DisputeRaised(disputeCount++, _reason);
    }

    /// @inheritdoc IDisputes
    function attachDocument(uint256 _disputeID, bytes calldata _attachment)
        external
        override
        resolvable(_disputeID)
    {
        // Local instance of variable. For saving gas.
        Dispute storage _dispute = disputes[_disputeID];

        // Check if sender is related to dispute
        assertMember(_dispute.project, _dispute.taskID, _msgSender());

        // Emit _attachment in event. To save it in logs.
        emit DisputeAttachmentAdded(_disputeID, _msgSender(), _attachment);
    }

    /// @inheritdoc IDisputes
    function resolveDispute(
        uint256 _disputeID,
        bytes calldata _judgement,
        bool _ratify
    ) external override onlyAdmin nonReentrant resolvable(_disputeID) {
        // If dispute is accepted
        if (_ratify) {
            // Complete dispute actions
            resolveHandler(_disputeID);

            // Mark dispute as accepted
            disputes[_disputeID].status = Status.Accepted;
        }
        // If dispute is rejected
        else {
            // Mark dispute as rejected
            disputes[_disputeID].status = Status.Rejected;
        }

        emit DisputeResolved(_disputeID, _ratify, _judgement);
    }

    /*******************************************************************************
     * -------------------------------PUBLIC VIEWS-------------------------------- *
     *******************************************************************************/

    /// @inheritdoc IDisputes
    function assertMember(
        address _project,
        uint256 _taskID,
        address _address
    ) public view override {
        // Local instance of variable. For saving gas.
        IProject _projectInstance = IProject(_project);

        // Get task subcontractor
        (, address _sc, ) = _projectInstance.getTask(_taskID);

        // Revert is signer is not builder, contractor or subcontractor.
        bool _result = _projectInstance.builder() == _address ||
            _projectInstance.contractor() == _address ||
            _sc == _address;
        require(_result, "Disputes::!Member");
    }

    /// @inheritdoc IDisputes
    function isTrustedForwarder(address _forwarder)
        public
        view
        override(ERC2771ContextUpgradeable, IDisputes)
        returns (bool)
    {
        return homeFi.isTrustedForwarder(_forwarder);
    }

    /*******************************************************************************
     * ---------------------------INTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /**
     * @notice Given an id, attempt to execute the action to enforce the arbitration

     * @notice logic for decoding and enforcing outcome of arbitration judgement

     * @param _disputeID uint256 - the dispute to attempt to
     */
    function resolveHandler(uint256 _disputeID) internal {
        // Local instance of variable. For saving gas.
        Dispute storage dispute = disputes[_disputeID];

        // If action type is add task then execute add task
        if (dispute.actionType == ActionType.TaskAdd) {
            executeTaskAdd(dispute.project, dispute.actionData);
        }
        // If action type is task change then execute task change
        else if (dispute.actionType == ActionType.TaskChange) {
            executeTaskChange(dispute.project, dispute.actionData);
        }
        // Else execute task pay
        else {
            executeTaskPay(dispute.project, dispute.actionData);
        }
    }

    /**
     * @dev Arbitration enforcement of task change orders

     * @param _project address - the project address of the dispute
     * @param _actionData bytes - the task add transaction data stored when dispute was raised
     * - _hash bytes[] - bytes IPFS hash of task details
     * - _taskCosts uint256[] - an array of cost for each task index
     * - _taskCount uint256 - current task count before adding these tasks. Can be fetched by taskCount.
     *   For signature security.
     * - _projectAddress address - the address of this contract. For signature security.
     */
    function executeTaskAdd(address _project, bytes memory _actionData)
        internal
    {
        IProject(_project).addTasks(_actionData, bytes(""));
    }

    /**
     * @dev Arbitration enforcement of task change orders

     * @param _project address - the project address of the dispute
     * @param _actionData bytes - the task change order transaction data stored when dispute was raised
     * - _taskID uint256 - index of the task
     * - _newSC address - address of new subcontractor.
     *   If do not want to replace subcontractor, then pass address of existing subcontractor.
     * - _newCost uint256 - new cost for the task.
     *   If do not want to change cost, then pass existing cost.
     * - _project address - address of project
     */
    function executeTaskChange(address _project, bytes memory _actionData)
        internal
    {
        IProject(_project).changeOrder(_actionData, bytes(""));
    }

    /**
     * @dev Arbitration enforcement of task payout

     * @param _project address - the project address of the dispute
     * @param _actionData bytes - the task payout transaction data stored when dispute was raised
     * - _taskID uint256 - the index of task
     * - _projectAddress address - the address of this contract. For signature security.
     */
    function executeTaskPay(address _project, bytes memory _actionData)
        internal
    {
        IProject(_project).setComplete(_actionData, bytes(""));
    }
}
