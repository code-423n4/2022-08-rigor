// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

/*******************************************************************************
 * ----------------------------------STRUCTS---------------------------------- *
 *******************************************************************************/

// Task metadata
struct Task {
    // Metadata //
    uint256 cost; // Cost of task
    address subcontractor; // Subcontractor of task
    // Lifecycle //
    TaskStatus state; // Status of task
    mapping(uint256 => bool) alerts; // Alerts of task
}

/*******************************************************************************
 * -----------------------------------ENUMS----------------------------------- *
 *******************************************************************************/

enum TaskStatus {
    None,
    Inactive,
    Active,
    Complete
}

enum Lifecycle {
    None,
    TaskAllocated,
    SCConfirmed
}

/**
 * @title Tasks Library for HomeFi v2.5.0

 * @notice Internal library used in Project. Contains functions specific to a task actions and lifecycle.
 */
library Tasks {
    /// @dev only allow inactive tasks. Task is inactive if SC is unconfirmed.
    modifier onlyInactive(Task storage _self) {
        require(_self.state == TaskStatus.Inactive, "Task::active");
        _;
    }

    /// @dev only allow active tasks. Task is inactive if SC is confirmed.
    modifier onlyActive(Task storage _self) {
        require(_self.state == TaskStatus.Active, "Task::!Active");
        _;
    }

    /// @dev only allow funded tasks.
    modifier onlyFunded(Task storage _self) {
        require(
            _self.alerts[uint256(Lifecycle.TaskAllocated)],
            "Task::!funded"
        );
        _;
    }

    /// MUTABLE FUNCTIONS ///

    // Task Status Changing Functions //

    /**
     * @notice Create a new Task object

     * @dev cannot operate on initialized tasks

     * @param _self Task the task struct being mutated
     * @param _cost uint the number of tokens to be escrowed in this contract
     */
    function initialize(Task storage _self, uint256 _cost) public {
        _self.cost = _cost;
        _self.state = TaskStatus.Inactive;
        _self.alerts[uint256(Lifecycle.None)] = true;
    }

    /**
     * @notice Attempt to transition task state from Payment Pending to Complete

     * @dev modifier onlyActive

     * @param _self Task the task whose state is being mutated
     */
    function setComplete(Task storage _self)
        internal
        onlyActive(_self)
        onlyFunded(_self)
    {
        // State/ Lifecycle //
        _self.state = TaskStatus.Complete;
    }

    // Subcontractor Joining //

    /**
     * @dev Invite a subcontractor to the task
     * @dev modifier onlyInactive

     * @param _self Task the task being joined by subcontractor
     * @param _sc address the subcontractor being invited
     */
    function inviteSubcontractor(Task storage _self, address _sc)
        internal
        onlyInactive(_self)
    {
        _self.subcontractor = _sc;
    }

    /**
     * @dev As a subcontractor, accept an invitation to participate in a task.
     * @dev modifier onlyInactive
     * @param _self Task the task being joined by subcontractor
     * @param _sc Address of sender
     */
    function acceptInvitation(Task storage _self, address _sc)
        internal
        onlyInactive(_self)
    {
        // Prerequisites //
        require(_self.subcontractor == _sc, "Task::!SC");

        // State/ lifecycle //
        _self.alerts[uint256(Lifecycle.SCConfirmed)] = true;
        _self.state = TaskStatus.Active;
    }

    // Task Funding //

    /**
     * @dev Set a task as funded

     * @param _self Task the task being set as funded
     */
    function fundTask(Task storage _self) internal {
        // State/ Lifecycle //
        _self.alerts[uint256(Lifecycle.TaskAllocated)] = true;
    }

    /**
     * @dev Set a task as un-funded

     * @param _self Task the task being set as funded
     */
    function unAllocateFunds(Task storage _self) internal {
        // State/ lifecycle //
        _self.alerts[uint256(Lifecycle.TaskAllocated)] = false;
    }

    /**
     * @dev Set a task as un accepted/approved for SC

     * @dev modifier onlyActive

     * @param _self Task the task being set as funded
     */
    function unApprove(Task storage _self) internal {
        // State/ lifecycle //
        _self.alerts[uint256(Lifecycle.SCConfirmed)] = false;
        _self.state = TaskStatus.Inactive;
    }

    /// VIEWABLE FUNCTIONS ///

    /**
     * @dev Determine the current state of all alerts in the project

     * @param _self Task the task being queried for alert status

     * @return _alerts bool[3] array of bool representing whether Lifecycle alert has been reached
     */
    function getAlerts(Task storage _self)
        internal
        view
        returns (bool[3] memory _alerts)
    {
        uint256 _length = _alerts.length;
        for (uint256 i = 0; i < _length; i++) _alerts[i] = _self.alerts[i];
    }

    /**
     * @dev Return the numerical encoding of the TaskStatus enumeration stored as state in a task

     * @param _self Task the task being queried for state
     
     * @return _state uint 0: none, 1: inactive, 2: active, 3: complete
     */
    function getState(Task storage _self)
        internal
        view
        returns (uint256 _state)
    {
        return uint256(_self.state);
    }
}
