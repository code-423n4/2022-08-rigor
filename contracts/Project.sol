// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IHomeFi} from "./interfaces/IHomeFi.sol";
import {IProject} from "./interfaces/IProject.sol";
import {IDebtToken} from "./interfaces/IDebtToken.sol";
import {IDisputes} from "./interfaces/IDisputes.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {Tasks, Task, TaskStatus} from "./libraries/Tasks.sol";
import {SignatureDecoder} from "./libraries/SignatureDecoder.sol";

/**
 * @title Deployable Project Contract for HomeFi v2.5.0

 * @notice contains the primary logic around construction project management. 
 * Onboarding contractors, fund escrow, and completion tracking are all managed here. 
 * Significant multi-signature and meta-transaction functionality is included here.

 * @dev This contract is created as a clone copy for the end user
 */
contract Project is
    IProject,
    ReentrancyGuardUpgradeable,
    ERC2771ContextUpgradeable
{
    // Using Tasks library for Task struct
    using Tasks for Task;

    // Using SafeERC20Upgradeable library for IDebtToken
    using SafeERC20Upgradeable for IDebtToken;

    /*******************************************************************************
     * ------------------------FIXED INTERNAL STORED PROPERTIES------------------------- *
     *******************************************************************************/

    /// @notice Disputes contract instance
    address internal disputes;

    /// @notice mapping of tasks index to Task struct.
    mapping(uint256 => Task) internal tasks;

    /// @notice array of indexes of change ordered tasks
    uint256[] internal _changeOrderedTask;

    /*******************************************************************************
     * ----------------------FIXED PUBLIC STORED PROPERTIES----------------------- *
     *******************************************************************************/
    /// @inheritdoc IProject
    IHomeFi public override homeFi;
    /// @inheritdoc IProject
    IDebtToken public override currency;
    /// @inheritdoc IProject
    uint256 public override lenderFee;
    /// @inheritdoc IProject
    address public override builder;
    /// @inheritdoc IProject
    uint256 public constant override VERSION = 25000;

    /*******************************************************************************
     * ---------------------VARIABLE PUBLIC STORED PROPERTIES--------------------- *
     *******************************************************************************/
    /// @inheritdoc IProject
    address public override contractor;
    /// @inheritdoc IProject
    bool public override contractorConfirmed;
    /// @inheritdoc IProject
    uint256 public override hashChangeNonce;
    /// @inheritdoc IProject
    uint256 public override totalLent;
    /// @inheritdoc IProject
    uint256 public override totalAllocated;
    /// @inheritdoc IProject
    uint256 public override taskCount;
    /// @inheritdoc IProject
    bool public override contractorDelegated;
    /// @inheritdoc IProject
    uint256 public override lastAllocatedTask;
    /// @inheritdoc IProject
    uint256 public override lastAllocatedChangeOrderTask;
    /// @inheritdoc IProject
    mapping(address => mapping(bytes32 => bool)) public override approvedHashes;

    /// @dev Added to make sure master implementation cannot be initialized
    // solhint-disable-next-line no-empty-blocks
    constructor() initializer {}

    /*******************************************************************************
     * ---------------------------EXTERNAL TRANSACTION---------------------------- *
     *******************************************************************************/
    /// @inheritdoc IProject
    function initialize(
        address _currency,
        address _sender,
        address _homeFiAddress
    ) external override initializer {
        // Initialize variables
        homeFi = IHomeFi(_homeFiAddress);
        disputes = homeFi.disputesContract();
        lenderFee = homeFi.lenderFee();
        builder = _sender;
        currency = IDebtToken(_currency);
    }

    /// @inheritdoc IProject
    function approveHash(bytes32 _hash) external override {
        address _sender = _msgSender();
        // Allowing anyone to sign, as its hard to add restrictions here.
        // Store _hash as signed for sender.
        approvedHashes[_sender][_hash] = true;

        emit ApproveHash(_hash, _sender);
    }

    /// @inheritdoc IProject
    function inviteContractor(bytes calldata _data, bytes calldata _signature)
        external
        override
    {
        // Revert if contractor has already confirmed his invitation
        require(!contractorConfirmed, "Project::GC accepted");

        // Decode params from _data
        (address _contractor, address _projectAddress) = abi.decode(
            _data,
            (address, address)
        );

        // Revert if decoded project address does not match this contract. Indicating incorrect _data.
        require(_projectAddress == address(this), "Project::!projectAddress");

        // Revert if contractor address is invalid.
        require(_contractor != address(0), "Project::0 address");

        // Store new contractor
        contractor = _contractor;
        contractorConfirmed = true;

        // Check signature for builder and contractor
        checkSignature(_data, _signature);

        emit ContractorInvited(contractor);
    }

    /// @inheritdoc IProject
    function delegateContractor(bool _bool) external override {
        // Revert if sender is not builder
        require(_msgSender() == builder, "Project::!B");

        // Revert if contract not assigned
        require(contractor != address(0), "Project::0 address");

        // Store new bool for contractorDelegated
        contractorDelegated = _bool;

        emit ContractorDelegated(_bool);
    }

    /// @inheritdoc IProject
    function updateProjectHash(bytes calldata _data, bytes calldata _signature)
        external
        override
    {
        // Check for required signatures
        checkSignature(_data, _signature);

        // Decode params from _data
        (bytes memory _hash, uint256 _nonce) = abi.decode(
            _data,
            (bytes, uint256)
        );

        // Revert if decoded nonce is incorrect. This indicates wrong _data.
        require(_nonce == hashChangeNonce, "Project::!Nonce");

        // Increment to ensure a set of data and signature cannot be re-used.
        hashChangeNonce += 1;

        emit HashUpdated(_hash);
    }

    /// @inheritdoc IProject
    function lendToProject(uint256 _cost) external override nonReentrant {
        address _sender = _msgSender();

        // Revert if sender is not builder or Community Contract (lender)
        require(
            _sender == builder || _sender == homeFi.communityContract(),
            "Project::!Builder&&!Community"
        );

        // Revert if try to lend 0
        require(_cost > 0, "Project::!value>0");

        // Revert if try to lend more than project cost
        uint256 _newTotalLent = totalLent + _cost;
        require(
            projectCost() >= uint256(_newTotalLent),
            "Project::value>required"
        );

        if (_sender == builder) {
            // Transfer assets from builder to this contract
            currency.safeTransferFrom(_sender, address(this), _cost);
        }

        // Update total lent with added lend
        totalLent = _newTotalLent;

        emit LendToProject(_cost);

        // Allocate funds to tasks and mark then as allocated
        allocateFunds();
    }

    /// @inheritdoc IProject
    function addTasks(bytes calldata _data, bytes calldata _signature)
        external
        override
    {
        // If the sender is disputes contract, then do not check for signatures.
        if (_msgSender() != disputes) {
            // Check for required signatures
            checkSignature(_data, _signature);
        }

        // Decode params from _data
        (
            bytes[] memory _hash,
            uint256[] memory _taskCosts,
            uint256 _taskCount,
            address _projectAddress
        ) = abi.decode(_data, (bytes[], uint256[], uint256, address));

        // Revert if decoded taskCount is incorrect. This indicates wrong data.
        require(_taskCount == taskCount, "Project::!taskCount");

        // Revert if decoded project address does not match this contract. Indicating incorrect _data.
        require(_projectAddress == address(this), "Project::!projectAddress");

        // Revert if IPFS hash array length is not equal to task cost array length.
        uint256 _length = _hash.length;
        require(_length == _taskCosts.length, "Project::Lengths !match");

        // Loop over all the new tasks.
        for (uint256 i = 0; i < _length; i++) {
            // Increment local task counter.
            _taskCount += 1;

            // Check task cost precision. Revert if too precise.
            checkPrecision(_taskCosts[i]);

            // Initialize task.
            tasks[_taskCount].initialize(_taskCosts[i]);
        }

        // Update task counter equal to local task counter.
        taskCount = _taskCount;

        emit TasksAdded(_taskCosts, _hash);
    }

    /// @inheritdoc IProject
    function updateTaskHash(bytes calldata _data, bytes calldata _signature)
        external
        override
    {
        // Decode params from _data
        (bytes memory _taskHash, uint256 _nonce, uint256 _taskID) = abi.decode(
            _data,
            (bytes, uint256, uint256)
        );

        // Revert if decoded nonce is incorrect. This indicates wrong data.
        require(_nonce == hashChangeNonce, "Project::!Nonce");

        // If subcontractor has confirmed then check signature using `checkSignatureTask`.
        // Else check signature using `checkSignature`.
        if (getAlerts(_taskID)[2]) {
            // If subcontractor has confirmed.
            checkSignatureTask(_data, _signature, _taskID);
        } else {
            // If subcontractor not has confirmed.
            checkSignature(_data, _signature);
        }

        // Increment to ensure a set of data and signature cannot be re-used.
        hashChangeNonce += 1;

        emit TaskHashUpdated(_taskID, _taskHash);
    }

    /// @inheritdoc IProject
    function inviteSC(uint256[] calldata _taskList, address[] calldata _scList)
        external
        override
    {
        // Revert if sender is neither builder nor contractor.
        require(
            _msgSender() == builder || _msgSender() == contractor,
            "Project::!Builder||!GC"
        );

        // Revert if taskList array length not equal to scList array length.
        uint256 _length = _taskList.length;
        require(_length == _scList.length, "Project::Lengths !match");

        // Invite subcontractor for each task.
        for (uint256 i = 0; i < _length; i++) {
            _inviteSC(_taskList[i], _scList[i], false);
        }

        emit MultipleSCInvited(_taskList, _scList);
    }

    /// @inheritdoc IProject
    function acceptInviteSC(uint256[] calldata _taskList) external override {
        // Accept invitation for each task in taskList.
        uint256 _length = _taskList.length;
        for (uint256 i = 0; i < _length; i++) {
            tasks[_taskList[i]].acceptInvitation(_msgSender());
        }

        emit SCConfirmed(_taskList);
    }

    /// @inheritdoc IProject
    function setComplete(bytes calldata _data, bytes calldata _signature)
        external
        override
    {
        // Decode params from _data
        (uint256 _taskID, address _projectAddress) = abi.decode(
            _data,
            (uint256, address)
        );

        // Revert if decoded project address does not match this contract. Indicating incorrect _data.
        require(_projectAddress == address(this), "Project::!Project");

        // If the sender is disputes contract, then do not check for signatures.
        if (_msgSender() != disputes) {
            // Check signatures.
            checkSignatureTask(_data, _signature, _taskID);
        }

        // Mark task as complete. Only works when task is active.
        tasks[_taskID].setComplete();

        // Transfer funds to subcontractor.
        currency.safeTransfer(
            tasks[_taskID].subcontractor,
            tasks[_taskID].cost
        );

        emit TaskComplete(_taskID);
    }

    /// @inheritdoc IProject
    function recoverTokens(address _tokenAddress) external override {
        /* If the token address is same as currency of this project,
            then first check if all tasks are complete */
        if (_tokenAddress == address(currency)) {
            // Iterate for each task and check if it is complete.
            uint256 _length = taskCount;
            for (uint256 _taskID = 1; _taskID <= _length; _taskID++) {
                require(tasks[_taskID].getState() == 3, "Project::!Complete");
            }
        }

        // Create token instance.
        IDebtToken _token = IDebtToken(_tokenAddress);

        // Check the balance of _token in this contract.
        uint256 _leftOutTokens = _token.balanceOf(address(this));

        // If balance is present then it to the builder.
        if (_leftOutTokens > 0) {
            _token.safeTransfer(builder, _leftOutTokens);
        }
    }

    /// @inheritdoc IProject
    function changeOrder(bytes calldata _data, bytes calldata _signature)
        external
        override
        nonReentrant
    {
        // Decode params from _data
        (
            uint256 _taskID,
            address _newSC,
            uint256 _newCost,
            address _project
        ) = abi.decode(_data, (uint256, address, uint256, address));

        // If the sender is disputes contract, then do not check for signatures.
        if (_msgSender() != disputes) {
            // Check for required signatures.
            checkSignatureTask(_data, _signature, _taskID);
        }

        // Revert if decoded project address does not match this contract. Indicating incorrect _data.
        require(_project == address(this), "Project::!projectAddress");

        // Local variable for task cost. For gas saving.
        uint256 _taskCost = tasks[_taskID].cost;

        // Local variable indicating if subcontractor is already unapproved.
        bool _unapproved = false;

        // If task cost is to be changed.
        if (_newCost != _taskCost) {
            // Check new task cost precision. Revert if too precise.
            checkPrecision(_newCost);

            // Local variable for total cost allocated. For gas saving.
            uint256 _totalAllocated = totalAllocated;

            // If tasks are already allocated with old cost.
            if (tasks[_taskID].alerts[1]) {
                // If new task cost is less than old task cost.
                if (_newCost < _taskCost) {
                    // Find the difference between old - new.
                    uint256 _withdrawDifference = _taskCost - _newCost;

                    // Reduce this difference from total cost allocated.
                    // As the same task is now allocated with lesser cost.
                    totalAllocated -= _withdrawDifference;

                    // Withdraw the difference back to builder's account.
                    // As this additional amount may not be required by the project.
                    autoWithdraw(_withdrawDifference);
                }
                // If new cost is more than task cost but total lent is enough to cover for it.
                else if (totalLent - _totalAllocated >= _newCost - _taskCost) {
                    // Increase the difference of new cost and old cost to total allocated.
                    totalAllocated += _newCost - _taskCost;
                }
                // If new cost is more than task cost and totalLent is not enough.
                else {
                    // Un-confirm SC, mark task as inactive, mark allocated as false, mark lifecycle as None

                    // Mark task as inactive by unapproving subcontractor.
                    // As subcontractor can only be approved if task is allocated
                    _unapproved = true;
                    tasks[_taskID].unApprove();

                    // Mark task as not allocated.
                    tasks[_taskID].unAllocateFunds();

                    // Reduce total allocation by old task cost.
                    // As as needs to go though funding process again.
                    totalAllocated -= _taskCost;

                    // Add this task to _changeOrderedTask array. These tasks will be allocated first.
                    _changeOrderedTask.push(_taskID);
                }
            }

            // Store new cost for the task
            tasks[_taskID].cost = _newCost;

            emit ChangeOrderFee(_taskID, _newCost);
        }

        // If task subcontractor is to be changed.
        if (_newSC != tasks[_taskID].subcontractor) {
            // If task is not already unapproved, then un-approve it.
            // Un-approving task means marking subcontractor as unconfirmed.
            if (!_unapproved) {
                tasks[_taskID].unApprove();
            }

            // If new subcontractor is not zero address.
            if (_newSC != address(0)) {
                // Invite the new subcontractor for the task.
                _inviteSC(_taskID, _newSC, true);
            }
            // Else store zero address for the task subcontractor.
            // This implies that a subcontractor is not invited from the task.
            else {
                tasks[_taskID].subcontractor = address(0);
            }

            emit ChangeOrderSC(_taskID, _newSC);
        }
    }

    /// @inheritdoc IProject
    function raiseDispute(bytes calldata _data, bytes calldata _signature)
        external
        override
    {
        // Recover the signer from the signature
        address signer = SignatureDecoder.recoverKey(
            keccak256(_data),
            _signature,
            0
        );

        // Decode params from _data
        (address _project, uint256 _task, , , ) = abi.decode(
            _data,
            (address, uint256, uint8, bytes, bytes)
        );

        // Revert if decoded project address does not match this contract. Indicating incorrect _data.
        require(_project == address(this), "Project::!projectAddress");

        if (_task == 0) {
            // Revet if sender is not builder or contractor
            require(
                signer == builder || signer == contractor,
                "Project::!(GC||Builder)"
            );
        } else {
            // Revet if sender is not builder, contractor or task's subcontractor
            require(
                signer == builder ||
                    signer == contractor ||
                    signer == tasks[_task].subcontractor,
                "Project::!(GC||Builder||SC)"
            );

            if (signer == tasks[_task].subcontractor) {
                // If sender is task's subcontractor, revert if invitation is not accepted.
                require(getAlerts(_task)[2], "Project::!SCConfirmed");
            }
        }

        // Make a call to Disputes contract raiseDisputes.
        IDisputes(disputes).raiseDispute(_data, _signature);
    }

    /*******************************************************************************
     * ------------------------------EXTERNAL VIEWS------------------------------- *
     *******************************************************************************/

    /// @inheritdoc IProject
    function getTask(uint256 id)
        external
        view
        override
        returns (
            uint256 cost,
            address subcontractor,
            TaskStatus state
        )
    {
        cost = tasks[id].cost;
        subcontractor = tasks[id].subcontractor;
        state = tasks[id].state;
    }

    /// @inheritdoc IProject
    function changeOrderedTask()
        external
        view
        override
        returns (uint256[] memory)
    {
        return _changeOrderedTask;
    }

    /*******************************************************************************
     * ----------------------------PUBLIC TRANSACTIONS---------------------------- *
     *******************************************************************************/

    /// @inheritdoc IProject
    function allocateFunds() public override {
        // Max amount out times this loop will run
        // This is to ensure the transaction do not run out of gas (max gas limit)
        uint256 _maxLoop = 50;

        // Difference of totalLent and totalAllocated is what can be used to allocate new tasks
        uint256 _costToAllocate = totalLent - totalAllocated;

        // Bool if max loop limit is exceeded
        bool _exceedLimit;

        // Local instance of lastAllocatedChangeOrderTask. To save gas.
        uint256 i = lastAllocatedChangeOrderTask;

        // Local instance of lastAllocatedTask. To save gas.
        uint256 j = lastAllocatedTask;

        // Initialize empty array in which allocated tasks will be added.
        uint256[] memory _tasksAllocated = new uint256[](
            taskCount - j + _changeOrderedTask.length - i
        );

        // Number of times a loop has run.
        uint256 _loopCount;

        /// CHANGE ORDERED TASK FUNDING ///

        // Any tasks added to _changeOrderedTask will be allocated first
        if (_changeOrderedTask.length > 0) {
            // Loop from lastAllocatedChangeOrderTask to _changeOrderedTask length (until _maxLoop)
            for (; i < _changeOrderedTask.length; i++) {
                // Local instance of task cost. To save gas.
                uint256 _taskCost = tasks[_changeOrderedTask[i]].cost;

                // If _maxLoop limit is reached then stop looping
                if (_loopCount >= _maxLoop) {
                    _exceedLimit = true;
                    break;
                }

                // If there is enough funds to allocate this task
                if (_costToAllocate >= _taskCost) {
                    // Reduce task cost from _costToAllocate
                    _costToAllocate -= _taskCost;

                    // Mark the task as allocated
                    tasks[_changeOrderedTask[i]].fundTask();

                    // Add task to _tasksAllocated array
                    _tasksAllocated[_loopCount] = _changeOrderedTask[i];

                    // Increment loop counter
                    _loopCount++;
                }
                // If there are not enough funds to allocate this task then stop looping
                else {
                    break;
                }
            }

            // If all the change ordered tasks are allocated, then delete
            // the changeOrderedTask array and reset lastAllocatedChangeOrderTask.
            if (i == _changeOrderedTask.length) {
                lastAllocatedChangeOrderTask = 0;
                delete _changeOrderedTask;
            }
            // Else store the last allocated change order task index.
            else {
                lastAllocatedChangeOrderTask = i;
            }
        }

        /// TASK FUNDING ///

        // If lastAllocatedTask is lesser than taskCount, that means there are un-allocated tasks
        if (j < taskCount) {
            // Loop from lastAllocatedTask + 1 to taskCount (until _maxLoop)
            for (++j; j <= taskCount; j++) {
                // Local instance of task cost. To save gas.
                uint256 _taskCost = tasks[j].cost;

                // If _maxLoop limit is reached then stop looping
                if (_loopCount >= _maxLoop) {
                    _exceedLimit = true;
                    break;
                }

                // If there is enough funds to allocate this task
                if (_costToAllocate >= _taskCost) {
                    // Reduce task cost from _costToAllocate
                    _costToAllocate -= _taskCost;

                    // Mark the task as allocated
                    tasks[j].fundTask();

                    // Add task to _tasksAllocated array
                    _tasksAllocated[_loopCount] = j;

                    // Increment loop counter
                    _loopCount++;
                }
                // If there are not enough funds to allocate this task then stop looping
                else {
                    break;
                }
            }

            // If all pending tasks are allocated store lastAllocatedTask equal to taskCount
            if (j > taskCount) {
                lastAllocatedTask = taskCount;
            }
            // If not all tasks are allocated store updated lastAllocatedTask
            else {
                lastAllocatedTask = --j;
            }
        }

        // If any tasks is allocated, then emit event
        if (_loopCount > 0) emit TaskAllocated(_tasksAllocated);

        // If allocation was incomplete, then emit event
        if (_exceedLimit) emit IncompleteAllocation();

        // Update totalAllocated with all allocations
        totalAllocated = totalLent - _costToAllocate;
    }

    /*******************************************************************************
     * -------------------------------PUBLIC VIEWS-------------------------------- *
     *******************************************************************************/

    /// @inheritdoc IProject
    function projectCost() public view override returns (uint256 _cost) {
        // Local instance of taskCount. To save gas.
        uint256 _length = taskCount;

        // Iterate over all tasks to sum their cost
        for (uint256 _taskID = 1; _taskID <= _length; _taskID++) {
            _cost += tasks[_taskID].cost;
        }
    }

    /// @inheritdoc IProject
    function getAlerts(uint256 _taskID)
        public
        view
        override
        returns (bool[3] memory _alerts)
    {
        return tasks[_taskID].getAlerts();
    }

    /// @inheritdoc IProject
    function isTrustedForwarder(address _forwarder)
        public
        view
        override(ERC2771ContextUpgradeable, IProject)
        returns (bool)
    {
        return homeFi.isTrustedForwarder(_forwarder);
    }

    /*******************************************************************************
     * ---------------------------INTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /**
     * @dev Invite subcontractors for a single task. This can be called by builder or contractor.
     * _taskList must not have a task which already has approved subcontractor.
     
     * @param _taskID uint256 task index
     * @param _sc address addresses of subcontractor for the respective task
     * @param _emitEvent whether to emit event for each sc added or not
     */
    function _inviteSC(
        uint256 _taskID,
        address _sc,
        bool _emitEvent
    ) internal {
        // Revert if sc to invite is address 0
        require(_sc != address(0), "Project::0 address");

        // Internal call to tasks invite contractor
        tasks[_taskID].inviteSubcontractor(_sc);

        // If `_emitEvent` is true (called via changeOrder) then emit event
        if (_emitEvent) {
            emit SingleSCInvited(_taskID, _sc);
        }
    }

    /**
     * @dev Transfer excess funds back to builder wallet.
     * Called internally in task changeOrder when new task cost is lower than older cost.

     * @param _amount uint256 - amount of excess funds
     */
    function autoWithdraw(uint256 _amount) internal {
        // Reduce amount from totalLent
        totalLent -= _amount;

        // Transfer amount to builder address
        currency.safeTransfer(builder, _amount);

        emit AutoWithdrawn(_amount);
    }

    /**
     * @dev Check if recovered signatures match with builder and contractor address.
     * Signatures must be in sequential order. First builder and then contractor.
     * Reverts if signature do not match.
     * If contractor is not assigned then only checks for builder signature.
     * If contractor is assigned but not delegated then only checks for builder and contractor signature.
     * If contractor is assigned and delegated then only checks for contractor signature.

     * @param _data bytes encoded parameters
     * @param _signature bytes appended signatures
     */
    function checkSignature(bytes calldata _data, bytes calldata _signature)
        internal
    {
        // Calculate hash from bytes
        bytes32 _hash = keccak256(_data);

        // When there is no contractor
        if (contractor == address(0)) {
            // Check for builder's signature
            checkSignatureValidity(builder, _hash, _signature, 0);
        }
        // When there is a contractor
        else {
            // When builder has delegated his rights to contractor
            if (contractorDelegated) {
                //  Check contractor's signature
                checkSignatureValidity(contractor, _hash, _signature, 0);
            }
            // When builder has not delegated rights to contractor
            else {
                // Check for both B and GC signatures
                checkSignatureValidity(builder, _hash, _signature, 0);
                checkSignatureValidity(contractor, _hash, _signature, 1);
            }
        }
    }

    /**
     * @dev Check if recovered signatures match with builder, contractor and subcontractor address for a task.
     * Signatures must be in sequential order. First builder, then contractor, and then subcontractor.
     * reverts if signatures do not match.
     * If contractor is not assigned then only checks for builder and subcontractor signature.
     * If contractor is assigned but not delegated then only checks for builder, contractor and subcontractor signature.
     * If contractor is assigned and delegated then only checks for contractor and subcontractor signature.

     * @param _data bytes encoded parameters
     * @param _signature bytes appended signatures
     * @param _taskID index of the task.
     */
    function checkSignatureTask(
        bytes calldata _data,
        bytes calldata _signature,
        uint256 _taskID
    ) internal {
        // Calculate hash from bytes
        bytes32 _hash = keccak256(_data);

        // Local instance of subcontractor. To save gas.
        address _sc = tasks[_taskID].subcontractor;

        // When there is no contractor
        if (contractor == address(0)) {
            // Just check for B and SC sign
            checkSignatureValidity(builder, _hash, _signature, 0);
            checkSignatureValidity(_sc, _hash, _signature, 1);
        }
        // When there is a contractor
        else {
            // When builder has delegated his rights to contractor
            if (contractorDelegated) {
                // Check for GC and SC sign
                checkSignatureValidity(contractor, _hash, _signature, 0);
                checkSignatureValidity(_sc, _hash, _signature, 1);
            }
            // When builder has not delegated rights to contractor
            else {
                // Check for B, SC and GC signatures
                checkSignatureValidity(builder, _hash, _signature, 0);
                checkSignatureValidity(contractor, _hash, _signature, 1);
                checkSignatureValidity(_sc, _hash, _signature, 2);
            }
        }
    }

    /**
     * @dev Internal function for checking signature validity
     * @dev Checks if the signature is approved or recovered
     * @dev Reverts if not

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
    ) internal {
        address _recoveredSignature = SignatureDecoder.recoverKey(
            _hash,
            _signature,
            _signatureIndex
        );
        require(
            _recoveredSignature == _address || approvedHashes[_address][_hash],
            "Project::invalid signature"
        );
        // delete from approvedHash
        delete approvedHashes[_address][_hash];
    }

    /*******************************************************************************
     * -------------------------------INTERNAL PURE------------------------------- *
     *******************************************************************************/

    /**
     * @dev Check if precision is greater than 1000, if so, it reverts

     * @param _amount amount needed to be checked for precision.
     */
    function checkPrecision(uint256 _amount) internal pure {
        // Divide and multiply amount with 1000 should be equal to amount.
        // This ensures the amount is not too precise.
        require(
            ((_amount / 1000) * 1000) == _amount,
            "Project::Precision>=1000"
        );
    }
}
