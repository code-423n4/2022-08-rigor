import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { HomeFi } from '../../artifacts/types/HomeFi';
import { Project } from '../../artifacts/types/Project';
import { createProjectWithoutContractor, multisig } from '.';
import { MockContract } from 'ethereum-waffle';
import { createTasks } from './projectHelpers';
import { encodeData } from './ethersHelpers';

export const projectTests = async ({
  treasury,
  lenderFee,
  homeFiContract,
  tokenCurrency1,
  signers,
  project,
  mockDAIContract,
  mockETHContract,
  etherProject,
  project2,
  mockUSDCContract,
  tasksLibrary,
}: {
  treasury: string;
  lenderFee: number;
  homeFiContract: HomeFi;
  tokenCurrency1: any;
  signers: SignerWithAddress[];
  project: Project;
  mockDAIContract: MockContract;
  mockETHContract: MockContract;
  etherProject: Project;
  project2: Project;
  mockUSDCContract: MockContract;
  tasksLibrary: any;
}) => {
  const projectV2Version = 25000;
  const taskCost = 1e11;
  let taskList: number[] = [];
  let ethersTaskList: number[] = [];
  it('should be initialised properly', async () => {
    expect(await project.homeFi()).to.equal(homeFiContract.address);
    expect(await project.currency()).to.equal(tokenCurrency1);
    expect(await project.lenderFee()).to.equal(lenderFee);
    expect(await project.builder()).to.equal(signers[0].address);
    expect(await project.contractor()).to.equal(ethers.constants.AddressZero);
    expect(await project.contractorConfirmed()).to.equal(false);
    expect(await project.hashChangeNonce()).to.equal(0);
    expect(await project.totalLent()).to.equal(0);
    expect(await project.totalAllocated()).to.equal(0);
    expect(await project.taskCount()).to.equal(0);
    const { cost, subcontractor, state } = await project.getTask(0);
    expect(cost).to.equal(0);
    expect(subcontractor).to.equal(ethers.constants.AddressZero);
    expect(state).to.equal(0);
    expect(await project.VERSION()).to.equal(projectV2Version);
    expect(await project.contractorDelegated()).to.equal(false);
    expect(await project.lastAllocatedTask()).to.equal(0);
    expect(await project.changeOrderedTask()).to.deep.equal([]);
    expect(await project.lastAllocatedChangeOrderTask()).to.equal(0);
    expect(await project.getAlerts(0)).to.have.members([false, false, false]);
    expect(await project.projectCost()).to.equal(0);
    const count = (await homeFiContract.projectCount()).toNumber();
    const projectId = await homeFiContract.projectTokenId(project.address);
    const balance = await homeFiContract.balanceOf(signers[0].address);
    const balance2 = await homeFiContract.balanceOf(signers[4].address); // [from upgradability test] additional project from signer[4] was required in community tests
    const owner = await homeFiContract.ownerOf(projectId);
    expect(balance.add(balance2)).to.equal(count);
    expect(owner).to.equal(signers[0].address);
    expect(await homeFiContract.projects(projectId)).to.equal(project.address);
  });

  // --- updateProjectHash() ---
  it('should revert to update project hash with wrong hash', async () => {
    const newHash = '0x';
    const data = {
      types: ['bytes', 'uint256'],
      values: [newHash, (await project.hashChangeNonce()).toNumber() + 1],
    };
    const [encodedData, signature] = await multisig(data, [signers[0]]);
    const tx = project.updateProjectHash(encodedData, signature);
    await expect(tx).to.be.revertedWith('Project::!Nonce');
  });

  it('should revert update project hash with wrong signature (without Builder signature)', async () => {
    const newHash = '0x';
    const data = {
      types: ['bytes', 'uint256'],
      values: [newHash, await project.hashChangeNonce()],
    };
    const [encodedData, signature] = await multisig(data, [signers[1]]);
    const tx = project.updateProjectHash(encodedData, signature);
    await expect(tx).to.be.revertedWith('Project::invalid signature');
  });

  it('should be able update project hash by builder', async () => {
    const oldHashChangeNonce = await project.hashChangeNonce();
    const newHash = '0x';
    const data = {
      types: ['bytes', 'uint256'],
      values: [newHash, oldHashChangeNonce],
    };
    const [encodedData, signature] = await multisig(data, [signers[0]]);
    const tx = await project.updateProjectHash(encodedData, signature);
    await expect(tx).to.emit(project, 'HashUpdated').withArgs(newHash);
    expect(await project.hashChangeNonce()).to.equal(oldHashChangeNonce.add(1));
  });

  it('should be able to do onchain signature using approve hash', async () => {
    const oldHashChangeNonce = await project.hashChangeNonce();
    const newHash = '0x12';
    const data = {
      types: ['bytes', 'uint256'],
      values: [newHash, oldHashChangeNonce],
    };
    const encodedData = encodeData(data);
    const encodedMsgHash = ethers.utils.keccak256(encodedData);
    const tx = await project.approveHash(encodedMsgHash);

    await expect(tx)
      .to.emit(project, 'ApproveHash')
      .withArgs(encodedMsgHash, signers[0].address);

    await project.updateProjectHash(encodedData, '0x');
    expect(await project.hashChangeNonce()).to.equal(oldHashChangeNonce.add(1));
  });

  // --- addTasks() ---
  // TODO when called by dispute contract
  it('should revert to add task with wrong _taskCount', async () => {
    const hashArray = ['0x'];
    const costArray = [taskCost];
    const data = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [
        hashArray,
        costArray,
        (await project.taskCount()).toNumber() + 1,
        project.address,
      ],
    };
    const [encodedData, signature] = await multisig(data, [signers[0]]);

    const tx = project.addTasks(encodedData, signature);

    await expect(tx).to.be.revertedWith('Project::!taskCount');
  });

  it('should revert to add task with wrong project address', async () => {
    const hashArray = ['0x'];
    const costArray = [taskCost];
    const data = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [
        hashArray,
        costArray,
        await project.taskCount(),
        signers[1].address,
      ],
    };
    const [encodedData, signature] = await multisig(data, [signers[0]]);

    const tx = project.addTasks(encodedData, signature);

    await expect(tx).to.be.revertedWith('Project::!projectAddress');
  });

  it('should revert to add task with wrong hash and cost length', async () => {
    const hashArray = ['0x'];
    const costArray = [taskCost, 1e9];
    const data = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [
        hashArray,
        costArray,
        await project.taskCount(),
        project.address,
      ],
    };
    const [encodedData, signature] = await multisig(data, [signers[0]]);

    const tx = project.addTasks(encodedData, signature);

    await expect(tx).to.be.revertedWith('Project::Lengths !match');
  });

  it('should revert add task if task cost if is under required precision', async () => {
    const hashArray = ['0x'];
    let costArray = [1e3 - 1];
    let data = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [
        hashArray,
        costArray,
        await project.taskCount(),
        project.address,
      ],
    };
    let [encodedData, signature] = await multisig(data, [signers[0]]);

    let tx: any = project.addTasks(encodedData, signature);
    await expect(tx).to.be.revertedWith('Project::Precision>=1000');

    costArray = [1e3];
    data = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [
        hashArray,
        costArray,
        await project.taskCount(),
        project.address,
      ],
    };
    [encodedData, signature] = await multisig(data, [signers[0]]);
    tx = project.callStatic.addTasks(encodedData, signature);
    await expect(tx).to.not.be.revertedWith('Project::Precision>=1000');
  });

  it('should be able to add task', async () => {
    const hashArray = ['0x'];
    const costArray = [taskCost];
    taskList.push(taskCost);
    const data = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [
        hashArray,
        costArray,
        await project.taskCount(),
        project.address,
      ],
    };
    const [encodedData, signature] = await multisig(data, [signers[0]]);

    const tx = await project.addTasks(encodedData, signature);
    await expect(tx)
      .to.emit(project, 'TasksAdded')
      .withArgs(costArray, hashArray);

    expect(await project.taskCount()).to.equal(1);
    const { cost, subcontractor, state } = await project.getTask(1);
    expect(cost).to.equal(costArray[0]);
    expect(subcontractor).to.equal(ethers.constants.AddressZero);
    expect(state).to.equal(1);
  });

  it('should be able to change task hash with only B signature', async () => {
    const hashChangeNonce = (await project.hashChangeNonce()).toNumber();
    const taskID = 1;
    const modifiedSampleBytes = '0x12';
    const data = {
      types: ['bytes', 'uint256', 'uint256'],
      values: [modifiedSampleBytes, hashChangeNonce, taskID],
    };
    const [encodedData, signature] = await multisig(data, [signers[0]]);
    const tx = await project.updateTaskHash(encodedData, signature);
    await expect(tx)
      .to.emit(project, 'TaskHashUpdated')
      .withArgs(taskID, modifiedSampleBytes);

    expect(await project.hashChangeNonce()).to.equal(hashChangeNonce + 1);
  });

  // --- inviteSC() ---
  it('should revert to invite SC with wrong sender', async () => {
    const taskList = [1];
    const scList = [signers[2].address];

    const tx = project.connect(signers[2]).inviteSC(taskList, scList);

    await expect(tx).to.be.revertedWith('Project::!Builder||!GC');
  });

  it('should revert to invite SC with 0 address', async () => {
    const taskList = [1];
    const scList = [ethers.constants.AddressZero];

    const tx = project.inviteSC(taskList, scList);

    await expect(tx).to.be.revertedWith('Project::0 address');
  });

  it('should revert to invite SC with mismatch length of task and sc', async () => {
    const taskList = [1];
    const scList = [signers[2].address, signers[2].address];

    const tx = project.inviteSC(taskList, scList);

    await expect(tx).to.be.revertedWith('Project::Lengths !match');
  });

  it('should be able to invite SC and accept invite', async () => {
    const taskList = [1];
    const scList = [signers[2].address];

    const tx = await project.inviteSC(taskList, scList);

    await expect(tx)
      .to.emit(project, 'MultipleSCInvited')
      .withArgs(taskList, scList);

    const { subcontractor } = await project.getTask(1);
    expect(subcontractor).to.equal(scList[0]);
  });

  // --- acceptInviteSC() ---
  it('should revert to accept sc invite when sender !sc', async () => {
    const taskID = 1;
    const tx = project.connect(signers[0]).acceptInviteSC([taskID]);
    await expect(tx).to.be.revertedWith('Task::!SC');
  });

  it('should be able to accept sc invite when task not funded', async () => {
    const taskID = 1;
    const tx = await project.connect(signers[2]).acceptInviteSC([taskID]);
    await expect(tx).to.emit(project, 'SCConfirmed').withArgs([taskID]);
    const getAlerts = await project.getAlerts(taskID);
    expect(getAlerts[2]).to.equal(true);
    const { state } = await project.getTask(taskID);
    expect(state).to.equal(2);
  });

  // --- updateTaskHash() ---
  it('should revert to change task hash with wrong signatures or sequence', async () => {
    const hashChangeNonce = (await project.hashChangeNonce()).toNumber();
    const taskID = 1;
    const modifiedSampleBytes = '0x';
    const data = {
      types: ['bytes', 'uint256', 'uint256'],
      values: [modifiedSampleBytes, hashChangeNonce, taskID],
    };
    const wrongSignatureCombination = [
      [signers[0], signers[1]],
      [signers[1], signers[1]],
      [signers[0], signers[0]],
      [signers[1], signers[2]],
      [signers[2], signers[0]],
      [signers[2], signers[2]],
      [signers[0]],
      [signers[1]],
      [signers[2]],
    ];
    for (const wrongSignature of wrongSignatureCombination) {
      const [encodedData, signature] = await multisig(data, wrongSignature);
      const tx = project.updateTaskHash(encodedData, signature);

      await expect(tx).to.be.revertedWith('Project::invalid signature');
    }
  });

  it('should revert to change task hash with wrong nonce', async () => {
    const wrongHashChangeNonce =
      1 + (await project.hashChangeNonce()).toNumber();
    const taskID = 1;
    const modifiedSampleBytes = '0x';
    const data = {
      types: ['bytes', 'uint256', 'uint256'],
      values: [modifiedSampleBytes, wrongHashChangeNonce, taskID],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[2],
    ]);
    await expect(
      project.updateTaskHash(encodedData, signature),
    ).to.be.revertedWith('Project::!Nonce');
  });

  it('should be able to change task hash with only B and SC signature', async () => {
    const hashChangeNonce = (await project.hashChangeNonce()).toNumber();
    const taskID = 1;
    const modifiedSampleBytes = '0x';
    const data = {
      types: ['bytes', 'uint256', 'uint256'],
      values: [modifiedSampleBytes, hashChangeNonce, taskID],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[2],
    ]);
    const tx = await project.updateTaskHash(encodedData, signature);
    await expect(tx)
      .to.emit(project, 'TaskHashUpdated')
      .withArgs(taskID, modifiedSampleBytes);

    expect(await project.hashChangeNonce()).to.equal(hashChangeNonce + 1);
  });

  it('should revert to delegate GC when GC is zero address', async () => {
    const tx = project.delegateContractor(false);
    await expect(tx).to.be.revertedWith('Project::0 address');
  });

  // --- inviteContractor() ---
  it('should revert to invite contractor with wrong project address', async () => {
    const data = {
      types: ['address', 'address'],
      values: [signers[1].address, signers[0].address],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[1],
    ]);
    const tx = project.inviteContractor(encodedData, signature);

    await expect(tx).to.be.revertedWith('Project::!projectAddress');
  });

  it('should revert to invite contractor with zero contractor address', async () => {
    const data = {
      types: ['address', 'address'],
      values: [ethers.constants.AddressZero, project.address],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[1],
    ]);
    const tx = project.inviteContractor(encodedData, signature);

    await expect(tx).to.be.revertedWith('Project::0 address');
  });

  it('should revert to invite contractor with wrong signatures or sequence', async () => {
    const wrongSignatures = [
      [signers[1], signers[1]],
      [signers[0], signers[0]],
      [signers[0], signers[2]],
      [signers[2], signers[1]],
      [signers[1], signers[0]],
      [signers[2], signers[2]],
    ];
    for (const wrongSignatureSet of wrongSignatures) {
      const data = {
        types: ['address', 'address'],
        values: [signers[1].address, project.address],
      };
      const [encodedData, signature] = await multisig(data, wrongSignatureSet);
      const tx = project.inviteContractor(encodedData, signature);

      expect(tx).to.revertedWith('Project::invalid signature');
    }
  });

  it('should be able to invite contractor', async () => {
    expect(await project.contractor()).to.equal(ethers.constants.AddressZero);
    const data = {
      types: ['address', 'address'],
      values: [signers[1].address, project.address],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[1],
    ]);
    const tx = await project.inviteContractor(encodedData, signature);
    await expect(tx)
      .to.emit(project, 'ContractorInvited')
      .withArgs(signers[1].address);
    expect(await project.contractor()).to.equal(signers[1].address);
  });

  it('should revert to invite contractor when contractor already exists', async () => {
    const data = {
      types: ['address', 'address'],
      values: [signers[2].address, project.address],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[2],
    ]);
    const tx = project.inviteContractor(encodedData, signature);

    await expect(tx).to.be.revertedWith('Project::GC accepted');
  });

  it('should revert to add task with wrong signatures or sequence', async () => {
    const wrongSignatures = [
      [signers[1], signers[1]],
      [signers[0], signers[0]],
      [signers[0], signers[2]],
      [signers[2], signers[1]],
      [signers[1], signers[0]],
    ];
    for (const wrongSignatureSet of wrongSignatures) {
      const hashArray = ['0x'];
      const costArray = [taskCost];
      const data = {
        types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
        values: [
          hashArray,
          costArray,
          await project.taskCount(),
          project.address,
        ],
      };
      const [encodedData, signature] = await multisig(data, wrongSignatureSet);

      const tx = project.addTasks(encodedData, signature);

      expect(tx).to.revertedWith('Project::invalid signature');
    }
  });

  // --- lendToProject() ---
  it('should revert when try to fund without community || builder account', async () => {
    const projectCost = await project.projectCost();
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, projectCost)
      .returns(true);
    const tx = project.connect(signers[1]).lendToProject(projectCost);
    await expect(tx).to.be.revertedWith('Project::!Builder&&!Community');
  });

  it('should revert when try to fund zero amount', async () => {
    const tx = project.lendToProject(0);
    await expect(tx).to.be.revertedWith('Project::!value');
  });

  it('should revert when try to fund more than project cost', async () => {
    const projectCost = await project.projectCost();
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, projectCost.add(1))
      .returns(true);
    const tx = project.lendToProject(projectCost.add(1));
    await expect(tx).to.be.revertedWith('Project::value>required');
  });

  it('should be able to lent and fund properly by builder', async () => {
    const lendingAmount = await project.projectCost();
    const taskToBeFunded = 1;
    expect((await project.getAlerts(taskToBeFunded))[0]).to.equal(true);
    expect((await project.getAlerts(taskToBeFunded))[1]).to.equal(false);
    expect((await project.getAlerts(taskToBeFunded))[2]).to.equal(true);
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, lendingAmount)
      .returns(true);
    const tx = await project.lendToProject(lendingAmount);
    await expect(tx).to.emit(project, 'LendToProject').withArgs(lendingAmount);
    await expect(tx)
      .to.emit(project, 'TaskAllocated')
      .withArgs([taskToBeFunded]);

    expect(await project.totalLent()).to.equal(lendingAmount);
    expect(await project.totalAllocated()).to.equal(lendingAmount);
    expect(await project.totalAllocated()).to.equal(lendingAmount);
    expect(await project.lastAllocatedTask()).to.equal(taskToBeFunded);
    expect((await project.getAlerts(taskToBeFunded))[0]).to.equal(true);
    expect((await project.getAlerts(taskToBeFunded))[1]).to.equal(true);
    expect((await project.getAlerts(taskToBeFunded))[2]).to.equal(true);
  });

  // --- delegateContractor() ---
  it('should revert to delegate GC when sender is not builder', async () => {
    const tx = project.connect(signers[1]).delegateContractor(false);
    await expect(tx).to.be.revertedWith('Project::!B');
  });

  it('should be able to delegate GC', async () => {
    const boolArray = [false, true];
    for (const bool of boolArray) {
      const tx = await project.delegateContractor(bool);
      expect(tx).to.emit(project, 'ContractorDelegated').withArgs(bool);

      expect(await project.contractorDelegated()).to.equal(bool);
    }
  });

  it('should revert to add task without GC signature', async () => {
    const hashArray = ['0x'];
    const costArray = [taskCost];
    const data = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [
        hashArray,
        costArray,
        await project.taskCount(),
        project.address,
      ],
    };
    const [encodedData, signature] = await multisig(data, [signers[2]]);

    const tx = project.addTasks(encodedData, signature);
    expect(tx).to.revertedWith('Project::invalid signature');
  });

  // --- projectCost() ---
  it('should be able to return correct project cost', async () => {
    let sum = 0;
    for (const fee of taskList) {
      sum += fee;
    }
    expect(await project.projectCost()).to.equal(sum);
  });

  it('should not emit when call fund project with no task fund', async () => {
    const totalAllocated = await project.totalAllocated();
    const tx = await project.allocateFunds();
    await expect(tx).to.not.emit(project, 'TaskAllocated');
    expect(await project.totalAllocated()).to.equal(totalAllocated);
  });

  it('should be able to add 55 tasks with only GC signature', async () => {
    const hashArray = [];
    const costArray = [];
    for (let i = 0; i < 55; i++) {
      hashArray.push('0x');
      costArray.push(taskCost);
      taskList.push(taskCost);
    }

    const data = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [
        hashArray,
        costArray,
        await project.taskCount(),
        project.address,
      ],
    };
    const [encodedData, signature] = await multisig(data, [signers[1]]);

    const tx = await project.addTasks(encodedData, signature);
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(55 * taskCost);
    expect(await project.taskCount()).to.equal(taskList.length);
  });

  it('should only allocate first 50 tasks', async () => {
    // only fund for 51 tasks
    const lendingNeeded = 51 * taskCost;
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, lendingNeeded)
      .returns(true);
    const tx = await project.lendToProject(lendingNeeded);
    //IncompleteAllocation should emit if partially funded but gone over the maxLoop. Incomplete due to maxLoop, NOT partial funds.
    await expect(tx).to.emit(project, 'IncompleteAllocation').withArgs();
    // lastTotalAllocated = (await projectV2Contract.totalAllocated()).toNumber();

    // should only fund till 50 tasks.
    const expectedFundTaskArray = [];
    for (let i = 2; i <= 51; i++) {
      const alertsArray = await project.getAlerts(i);
      expect(alertsArray[0]).to.equal(true);
      expect(alertsArray[1]).to.equal(true);
      expect(alertsArray[2]).to.equal(false);
      expectedFundTaskArray.push(i);
    }
    for (let i = 52; i <= 56; i++) {
      const alertsArray = await project.getAlerts(i);
      expect(alertsArray[0]).to.equal(true);
      expect(alertsArray[1]).to.equal(false);
      expect(alertsArray[2]).to.equal(false);
    }

    await expect(tx)
      .to.emit(project, 'TaskAllocated')
      .withArgs(expectedFundTaskArray);

    expect(await project.lastAllocatedTask()).to.equal(51);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(taskCost); //cost of last 1 unallocated tasks
    expect(
      (await project.projectCost()).sub(await project.totalAllocated()),
    ).to.equal(5 * taskCost); // cost of remaining tasks
  });

  it('should be able to fund project to complete task allocations till lent amount', async () => {
    const tx = await project.allocateFunds();
    for (let i = 2; i <= 52; i++) {
      const alertsArray = await project.getAlerts(i);
      expect(alertsArray[0]).to.equal(true);
      expect(alertsArray[1]).to.equal(true);
      expect(alertsArray[2]).to.equal(false);
    }
    for (let i = 53; i <= 56; i++) {
      const alertsArray = await project.getAlerts(i);
      expect(alertsArray[0]).to.equal(true);
      expect(alertsArray[1]).to.equal(false);
      expect(alertsArray[2]).to.equal(false);
    }

    await expect(tx).to.emit(project, 'TaskAllocated').withArgs([52]);
    // IncompleteAllocation shouldn't emit if partially funded but not gone over the maxLoop
    await expect(tx).to.not.emit(project, 'IncompleteAllocation');

    expect(await project.lastAllocatedTask()).to.equal(52);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(0);
    expect(
      (await project.projectCost()).sub(await project.totalAllocated()),
    ).to.equal(4 * taskCost);
  });

  it('should fund all unfunded task', async () => {
    const lendingNeeded = 4 * taskCost;
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, lendingNeeded)
      .returns(true);
    const tx = await project.lendToProject(lendingNeeded);
    // lastTotalAllocated = (await project.totalAllocated()).toNumber();
    const expectedFundTaskArray = [];

    for (let i = 53; i <= 56; i++) {
      const alertsArray = await project.getAlerts(i);
      expect(alertsArray[0]).to.equal(true);
      // expect(alertsArray[1]).to.equal(true);
      expect(alertsArray[2]).to.equal(false);
      expectedFundTaskArray.push(i);
    }

    await expect(tx)
      .to.emit(project, 'TaskAllocated')
      .withArgs(expectedFundTaskArray);
    // IncompleteAllocation shouldn't emit if partially funded but gone over the maxLoop. Incomplete due to partial funds NOT maxLoop.
    await expect(tx).to.not.emit(project, 'IncompleteAllocation');

    expect(await project.lastAllocatedTask()).to.equal(56);
    expect(await project.totalLent()).equal(await project.totalAllocated());
    expect(await project.projectCost()).equal(await project.totalAllocated());
  });

  it("should be able to recover any token other than project to builder's account", async () => {
    await mockUSDCContract.mock.balanceOf
      .withArgs(project.address)
      .returns(100);
    await mockUSDCContract.mock.transfer
      .withArgs(signers[0].address, 100)
      .returns(true);
    const tx = await project.recoverTokens(mockUSDCContract.address);
  });

  it('should be able to call recover fund even with 0 balance of that token in project, transfer does not work', async () => {
    await mockUSDCContract.mock.balanceOf.withArgs(project.address).returns(0);
    await mockUSDCContract.mock.transfer
      .withArgs(signers[0].address, 0)
      .returns(false);
    let tx = await project.recoverTokens(mockUSDCContract.address);
  });

  it('should revert to recover project token before all task are complete', async () => {
    const projectCurrency = await project.currency();
    const tx = project.recoverTokens(projectCurrency);
    await expect(tx).to.be.revertedWith('Project::!Complete');
  });

  it('should revert change order with wrong project address', async () => {
    const taskID = 1;
    const newSC = signers[2].address; // same as old
    const newCost = taskCost; // same as old
    const projectAddress = signers[1].address; //wrong address
    const data = {
      types: ['uint256', 'address', 'uint256', 'address'],
      values: [taskID, newSC, newCost, projectAddress],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[1],
      signers[2],
    ]);

    const tx = project.changeOrder(encodedData, signature);
    await expect(tx).to.be.revertedWith('Project::!projectAddress');
  });

  it('should revert to change order with wrong signatures or sequence', async () => {
    const taskID = 1;
    const newSC = ethers.constants.AddressZero;
    const newCost = taskCost; // same as old
    const projectAddress = project.address;
    const wrongSignatures = [
      [signers[0], signers[2]],
      [signers[1], signers[0]],
      [signers[2], signers[1]],
    ];
    for (const wrongSignature of wrongSignatures) {
      const data = {
        types: ['uint256', 'address', 'uint256', 'address'],
        values: [taskID, newSC, newCost, projectAddress],
      };
      const [encodedData, signature] = await multisig(data, wrongSignature);

      const tx = project.changeOrder(encodedData, signature);

      await expect(tx).to.be.revertedWith('Project::invalid signature');
    }
  });

  it('should be able to change order with only changed SC', async () => {
    const taskID = 1;
    const newSC = ethers.constants.AddressZero;
    const newCost = taskCost; // same as old
    const projectAddress = project.address;
    const data = {
      types: ['uint256', 'address', 'uint256', 'address'],
      values: [taskID, newSC, newCost, projectAddress],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[1],
      signers[2],
    ]);

    const tx = await project.changeOrder(encodedData, signature);
    tx.wait();

    await expect(tx).to.emit(project, 'ChangeOrderSC').withArgs(taskID, newSC);
    const taskDetails = await project.getTask(taskID);
    const alerts = await project.getAlerts(taskID);
    expect(taskDetails.cost).to.equal(newCost);
    expect(taskDetails.subcontractor).to.equal(newSC);
    expect(taskDetails.state).to.equal(1);
    expect(alerts[0]).to.equal(true);
    expect(alerts[1]).to.equal(true);
    expect(alerts[2]).to.equal(false);

    // invite SC
    await (await project.inviteSC([taskID], [signers[2].address])).wait();
    // accept SC invitation
    await (await project.connect(signers[2]).acceptInviteSC([taskID])).wait();
  });

  it('should be able to change order with increased task cost', async () => {
    const taskID = 1;
    const newSC = signers[3].address;
    const newCost = taskCost * 2;
    const projectAddress = project.address;
    const data = {
      types: ['uint256', 'address', 'uint256', 'address'],
      values: [taskID, newSC, newCost, projectAddress],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[1],
      signers[2],
    ]);

    const tx = await project.changeOrder(encodedData, signature);
    tx.wait();

    await expect(tx)
      .to.emit(project, 'ChangeOrderFee')
      .withArgs(taskID, newCost);
    await expect(tx)
      .to.emit(project, 'SingleSCInvited')
      .withArgs(taskID, newSC);
    await expect(tx).to.emit(project, 'ChangeOrderSC').withArgs(taskID, newSC);

    const taskDetails = await project.getTask(taskID);
    const alerts = await project.getAlerts(taskID);
    expect(taskDetails.cost).to.equal(newCost);
    expect(taskDetails.subcontractor).to.equal(newSC);
    expect(taskDetails.state).to.equal(1);
    expect(alerts[0]).to.equal(true);
    expect(alerts[1]).to.equal(false);
    expect(alerts[2]).to.equal(false);
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(taskCost);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(taskCost);

    expect(await project.lastAllocatedChangeOrderTask()).to.equal(0);
    expect((await project.changeOrderedTask())[0]).to.equal(taskID);

    // accept SC invitation
    await (await project.connect(signers[3]).acceptInviteSC([taskID])).wait();
  });

  it('should be able to change order with increase cost and automatic fund from existing lending', async () => {
    const taskID = 2;
    // invite SC
    await (await project.inviteSC([taskID], [signers[2].address])).wait();
    // accept SC invitation
    await (await project.connect(signers[2]).acceptInviteSC([taskID])).wait();
    const newSC = signers[2].address;
    const newCost = taskCost * 2;
    const projectAddress = project.address;
    const data = {
      types: ['uint256', 'address', 'uint256', 'address'],
      values: [taskID, newSC, newCost, projectAddress],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[1],
      signers[2],
    ]);

    const tx = await project.changeOrder(encodedData, signature);
    tx.wait();

    const taskDetails = await project.getTask(taskID);
    const alerts = await project.getAlerts(taskID);
    expect(taskDetails.cost).to.equal(newCost);
    expect(taskDetails.subcontractor).to.equal(newSC);
    expect(taskDetails.state).to.equal(2);
    expect(alerts[0]).to.equal(true);
    expect(alerts[1]).to.equal(true);
    expect(alerts[2]).to.equal(true);
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(2 * taskCost);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(0);

    const cost = taskCost * 2;
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, cost)
      .returns(true);
    const lendingTx = await project.lendToProject(cost);
    await lendingTx.wait();

    await expect(lendingTx).to.emit(project, 'TaskAllocated').withArgs([1]); // task 1 is being funded here

    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(0);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(0);
  });

  it('should be able to change order with non funded task', async () => {
    // Add a new task
    const taskCount = (await project.taskCount()).toNumber();
    const hashArray = ['0x'];
    const costArray = [taskCost];
    const scList = [signers[3].address];
    const taskList = [taskCount + 1];

    const taskData = {
      types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
      values: [hashArray, costArray, taskCount, project.address],
    };
    let [encodedData, signature] = await multisig(taskData, [signers[1]]);
    let tx = await project.addTasks(encodedData, signature);
    expect(await project.taskCount()).to.equal(taskCount + 1);

    tx = await project.inviteSC(taskList, scList);
    await expect(tx)
      .to.emit(project, 'MultipleSCInvited')
      .withArgs(taskList, scList);

    tx = await project.connect(signers[3]).acceptInviteSC(taskList);
    await expect(tx).to.emit(project, 'SCConfirmed').withArgs(taskList);

    const getAlerts = await project.getAlerts(taskList[0]);
    expect(getAlerts[1]).to.equal(false);
    expect(getAlerts[2]).to.equal(true);
    const { state } = await project.getTask(taskList[0]);
    expect(state).to.equal(2);

    const taskID = taskList[0];
    const newSC = signers[2].address;
    const newCost = taskCost * 2;
    const projectAddress = project.address;
    const dataChange = {
      types: ['uint256', 'address', 'uint256', 'address'],
      values: [taskID, newSC, newCost, projectAddress],
    };
    [encodedData, signature] = await multisig(dataChange, [
      signers[1],
      signers[3],
    ]);
    const projectCostBeforeChangeOrder = await project.projectCost();
    const totalLentBeforeChangeOrder = await project.totalLent();
    const totalAllocatedBeforeChangeOrder = await project.totalAllocated();
    tx = await project.changeOrder(encodedData, signature);
    tx.wait();

    await expect(tx)
      .to.emit(project, 'ChangeOrderFee')
      .withArgs(taskID, newCost);
    await expect(tx)
      .to.emit(project, 'SingleSCInvited')
      .withArgs(taskID, newSC);
    await expect(tx).to.emit(project, 'ChangeOrderSC').withArgs(taskID, newSC);

    const taskDetails = await project.getTask(taskID);
    const alerts = await project.getAlerts(taskID);
    expect(taskDetails.cost).to.equal(newCost);
    expect(taskDetails.subcontractor).to.equal(newSC);
    expect(taskDetails.state).to.equal(1);
    expect(alerts[0]).to.equal(true);
    expect(alerts[1]).to.equal(false);
    expect(alerts[2]).to.equal(false);

    // total lent fund should remain the same
    expect(totalLentBeforeChangeOrder).to.equal(await project.totalLent());

    // projectV2Contract cost should have increased
    expect(await project.projectCost()).to.equal(
      projectCostBeforeChangeOrder.add(taskCost),
    );
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(taskCost * 2);
    // as there is more lent fund than allocated, allocated fund should not increase as the task is unfunded
    expect(await project.totalAllocated()).to.equal(
      totalAllocatedBeforeChangeOrder,
    );

    // fund new project
    const cost = taskCost * 2;
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, cost)
      .returns(true);
    tx = await project.lendToProject(cost);
    await expect(tx).to.emit(project, 'TaskAllocated').withArgs([taskID]);
  });

  it('should be able to change order with less task cost and must auto withdraw', async () => {
    const taskID = 57;
    const newSC = signers[2].address;
    const newCost = taskCost; // same as old
    const projectAddress = project.address;
    const data = {
      types: ['uint256', 'address', 'uint256', 'address'],
      values: [taskID, newSC, newCost, projectAddress],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[1],
      signers[2],
    ]);

    await mockDAIContract.mock.transfer
      .withArgs(signers[0].address, taskCost)
      .returns(true);
    const tx = await project.changeOrder(encodedData, signature);
    tx.wait();

    await expect(tx)
      .to.emit(project, 'ChangeOrderFee')
      .withArgs(taskID, taskCost);
    const taskDetails = await project.getTask(taskID);
    const alerts = await project.getAlerts(taskID);
    expect(taskDetails.cost).to.equal(newCost);
    expect(taskDetails.subcontractor).to.equal(newSC);
    expect(taskDetails.state).to.equal(1);
    expect(alerts[0]).to.equal(true);
    expect(alerts[1]).to.equal(true);
    expect(alerts[2]).to.equal(false);
  });

  it('should be able to un delegate GC', async () => {
    const tx = await project.delegateContractor(false);
    expect(tx).to.emit(project, 'ContractorDelegated').withArgs(false);

    expect(await project.contractorDelegated()).to.equal(false);
  });

  // --- setComplete() ---
  it('should revert to complete a task with wrong project address', async () => {
    const taskID = 1;
    const data = {
      types: ['uint256', 'address'],
      values: [taskID, signers[1].address],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[1],
      signers[2],
    ]);

    const tx = project.setComplete(encodedData, signature);

    await expect(tx).to.be.revertedWith('Project::!Project');
  });

  it('should revert to complete a task with wrong signature', async () => {
    const taskID = 1;
    const correctSignatures = [
      signers[0].address,
      signers[1].address,
      signers[3].address,
    ];
    const signersArr = [signers[0], signers[1], signers[2], signers[3]];
    const wrongSignatures: SignerWithAddress[][] = [];
    signersArr.forEach((s0, i0, arr0) => {
      wrongSignatures.push([s0]);
      arr0.forEach((s1, _, arr1) => {
        wrongSignatures.push([s0, s1]);
        arr1.forEach(s2 => {
          const signatures = [s0, s1, s2];
          if (
            !(
              s0.address === correctSignatures[0] &&
              s1.address === correctSignatures[1] &&
              s2.address === correctSignatures[2]
            )
          ) {
            wrongSignatures.push(signatures);
          }
        });
      });
    });

    for (const wrongSignature of wrongSignatures) {
      const data = {
        types: ['uint256', 'address'],
        values: [taskID, project.address],
      };
      const [encodedData, signature] = await multisig(data, wrongSignature);

      const tx = project.setComplete(encodedData, signature);

      await expect(tx).to.be.revertedWith('Project::invalid signature');
    }
  });

  it('should be able to complete a task', async () => {
    const taskID = 1;
    const _taskCost = 2 * taskCost;
    const taskSC = signers[3];
    const data = {
      types: ['uint256', 'address'],
      values: [taskID, project.address],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[1],
      taskSC,
    ]);
    await mockDAIContract.mock.transfer
      .withArgs(taskSC.address, _taskCost)
      .returns(true);
    await mockDAIContract.mock.transfer
      .withArgs(await homeFiContract.treasury(), _taskCost / 1e3)
      .returns(true);
    const tx = await project.setComplete(encodedData, signature);
    tx.wait();

    await expect(tx).to.emit(project, 'TaskComplete').withArgs(taskID);

    const { state } = await project.getTask(taskID);
    expect(state).to.equal(3);
    const getAlerts = await project.getAlerts(taskID);
    expect(getAlerts[0]).to.equal(true);
    expect(getAlerts[1]).to.equal(true);
    expect(getAlerts[2]).to.equal(true);
    expect(await project.lastAllocatedChangeOrderTask()).to.equal(0);
    expect(await project.changeOrderedTask()).to.deep.equal([]);
  });

  it('should be able to invite SC for all remaining tasks (multiple sc invite and accept)', async () => {
    // invite SC
    const taskList = Array.from({ length: 54 }, (_, i) => i + 3);
    const scList = Array(54).fill(signers[2].address);
    let tx = await project.inviteSC(taskList, scList);
    // accept invite SC
    tx = await project.connect(signers[2]).acceptInviteSC(taskList);
    for (let i = 3; i < 3 + 54; i++) {
      const taskDetails = await project.getTask(i);
      const alerts = await project.getAlerts(i);
      expect(taskDetails.subcontractor).to.equal(signers[2].address);
      expect(taskDetails.state).to.equal(2);
      expect(alerts[0]).to.equal(true);
      expect(alerts[1]).to.equal(true);
      expect(alerts[2]).to.equal(true);
    }
  });

  it('should be able to change order 54 tasks', async () => {
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(0);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(0);
    let counter = 0;
    for (let i = 3; i < 3 + 54; i++) {
      const taskID = i;
      // multiply task cost by 100
      const newCost = taskCost * 100;
      const newSC = signers[2].address;
      const projectAddress = project.address;
      const data = {
        types: ['uint256', 'address', 'uint256', 'address'],
        values: [taskID, newSC, newCost, projectAddress],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[0],
        signers[1],
        signers[2],
      ]);

      const tx = await project.changeOrder(encodedData, signature);
      await expect(tx)
        .to.emit(project, 'ChangeOrderFee')
        .withArgs(taskID, newCost);

      const taskDetails = await project.getTask(taskID);
      const alerts = await project.getAlerts(taskID);
      expect(taskDetails.cost).to.equal(newCost);
      expect(taskDetails.subcontractor).to.equal(newSC);
      expect(taskDetails.state).to.equal(1);
      expect(alerts[0]).to.equal(true);
      expect(alerts[1]).to.equal(false);
      expect(alerts[2]).to.equal(false);
      expect((await project.changeOrderedTask())[counter]).to.equal(i);
      counter++;
    }
    expect(await project.lastAllocatedChangeOrderTask()).to.equal(0);
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(54 * taskCost * 99);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(54 * taskCost);
  });

  it('should be able to fund properly for max loop', async () => {
    // fund 51 tasks
    const lendingAmount = taskCost * 100 * 51 - taskCost * 54; // subtracting already funded amount
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, lendingAmount)
      .returns(true);
    const tx = await project.lendToProject(lendingAmount);
    await expect(tx)
      .to.emit(project, 'TaskAllocated')
      .withArgs(Array.from({ length: 50 }, (_, i) => i + 3));
    await expect(tx).to.emit(project, 'IncompleteAllocation');

    for (let i = 3; i <= 52; i++) {
      const taskDetails = await project.getTask(i);
      const alerts = await project.getAlerts(i);
      expect(taskDetails.state).to.equal(1);
      expect(alerts[0]).to.equal(true);
      expect(alerts[1]).to.equal(true);
      expect(alerts[2]).to.equal(false);
    }
    for (let i = 53; i <= 56; i++) {
      const taskDetails = await project.getTask(i);
      const alerts = await project.getAlerts(i);
      expect(taskDetails.state).to.equal(1);
      expect(alerts[0]).to.equal(true);
      expect(alerts[1]).to.equal(false);
      expect(alerts[2]).to.equal(false);
    }
    expect(await project.lastAllocatedChangeOrderTask()).to.equal(50);
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(3 * taskCost * 100);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(taskCost * 100);
  });

  it('should be able to fund properly for lending amount', async () => {
    const taskIDToBeFunded = 53;
    const tx = await project.allocateFunds();
    await expect(tx)
      .to.emit(project, 'TaskAllocated')
      .withArgs([taskIDToBeFunded]);
    await expect(tx).to.not.emit(project, 'IncompleteAllocation');

    const taskDetails = await project.getTask(taskIDToBeFunded);
    const alerts = await project.getAlerts(taskIDToBeFunded);
    expect(taskDetails.state).to.equal(1);
    expect(alerts[0]).to.equal(true);
    expect(alerts[1]).to.equal(true);
    expect(alerts[2]).to.equal(false);
    for (let i = 54; i <= 56; i++) {
      const taskDetails = await project.getTask(i);
      const alerts = await project.getAlerts(i);
      expect(taskDetails.state).to.equal(1);
      expect(alerts[0]).to.equal(true);
      expect(alerts[1]).to.equal(false);
      expect(alerts[2]).to.equal(false);
    }
    expect(await project.lastAllocatedChangeOrderTask()).to.equal(51);
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(3 * taskCost * 100);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(0);
  });

  it('should be able to fund properly for remaining change order tasks', async () => {
    // fund 3 tasks
    const lendingAmount = taskCost * 100 * 3;
    await mockDAIContract.mock.transferFrom
      .withArgs(signers[0].address, project.address, lendingAmount)
      .returns(true);
    const tx = await project.lendToProject(lendingAmount);
    await expect(tx)
      .to.emit(project, 'TaskAllocated')
      .withArgs(Array.from({ length: 3 }, (_, i) => i + 54));
    await expect(tx).to.not.emit(project, 'IncompleteAllocation');

    for (let i = 54; i <= 56; i++) {
      const taskDetails = await project.getTask(i);
      const alerts = await project.getAlerts(i);
      expect(taskDetails.state).to.equal(1);
      expect(alerts[0]).to.equal(true);
      expect(alerts[1]).to.equal(true);
      expect(alerts[2]).to.equal(false);
    }
    expect(await project.lastAllocatedChangeOrderTask()).to.equal(0);

    expect(await project.changeOrderedTask()).to.deep.equal([]);
    expect(
      (await project.projectCost()).sub(await project.totalLent()),
    ).to.equal(0);
    expect(
      (await project.totalLent()).sub(await project.totalAllocated()),
    ).to.equal(0);
  });

  it('should be able to assign SC and set complete all tasks', async () => {
    const taskList = Array.from({ length: 55 }, (_, i) => i + 3);
    const scList = Array(55).fill(signers[2].address);
    const inviteSCTx = await project.inviteSC(taskList, scList);
    await inviteSCTx.wait();
    const acceptInviteSCTx = await project
      .connect(signers[2])
      .acceptInviteSC(taskList);

    await acceptInviteSCTx.wait();

    for (let i = 2; i <= 57; i++) {
      const taskID = i;
      const _taskCost = (await project.getTask(taskID)).cost.toNumber();
      const data = {
        types: ['uint256', 'address'],
        values: [taskID, project.address],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[0],
        signers[1],
        signers[2],
      ]);
      await mockDAIContract.mock.transfer
        .withArgs(signers[2].address, _taskCost)
        .returns(true);
      await mockDAIContract.mock.transfer
        .withArgs(await homeFiContract.treasury(), _taskCost / 1e3)
        .returns(true);
      const tx = await project.setComplete(encodedData, signature);
    }
  });

  it('should revert to recover project token before all task are complete', async () => {
    const projectCurrency = await project.currency();
    await mockDAIContract.mock.balanceOf.withArgs(project.address).returns(100);
    await mockDAIContract.mock.transfer
      .withArgs(signers[0].address, 100)
      .returns(true);
    const tx = await project.recoverTokens(projectCurrency);
  });

  /// ETHER PROJECT ///

  it('should be able to invite GC in ether project', async () => {
    await createTasks(etherProject);
    ethersTaskList = [1e11, 1e11, 1e11];
    const data = {
      types: ['address', 'address'],
      values: [signers[1].address, etherProject.address],
    };
    const [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[1],
    ]);
    await etherProject
      .connect(signers[0])
      .inviteContractor(encodedData, signature);
  });

  it('should pass rest of the positive test cases for ether project', async () => {
    let projectCost = await etherProject.projectCost();
    await mockETHContract.mock.transferFrom
      .withArgs(signers[0].address, etherProject.address, projectCost)
      .returns(true);
    let tx = await etherProject.lendToProject(projectCost);
    await expect(tx).to.emit(etherProject, 'TaskAllocated').withArgs([1, 2, 3]);

    await etherProject.inviteSC([1], [signers[2].address]);
    await etherProject.connect(signers[2]).acceptInviteSC([1]);
    const taskID = 1;
    let data = {
      types: ['uint256', 'address'],
      values: [taskID, etherProject.address],
    };
    let [encodedData, signature] = await multisig(data, [
      signers[0],
      signers[1],
      signers[2],
    ]);
    await mockETHContract.mock.transfer
      .withArgs(signers[2].address, taskCost)
      .returns(true);
    await mockETHContract.mock.transfer
      .withArgs(treasury, taskCost / 1e3)
      .returns(true);
    await etherProject.setComplete(encodedData, signature);
    await mockETHContract.mock.transfer
      .withArgs(signers[1].address, ethersTaskList[0])
      .returns(true);
    await mockETHContract.mock.transfer
      .withArgs(treasury, ethersTaskList[0] / 1e3)
      .returns(true);
  });

  it('should be able to assign self', async () => {
    // B   - x  - x  - x  - x
    // GC  - x  - x  - y  - y
    // SC  - x  - y  - x  - y

    const builders = [signers[0], signers[0], signers[0], signers[0]];
    const contractors = [signers[0], signers[0], signers[1], signers[1]];
    const subContractors = [signers[0], signers[1], signers[0], signers[1]];

    for (let i = 0; i < builders.length; i++) {
      const count = (await homeFiContract.projectCount()).toNumber();
      ({ projectContractInstance: project } =
        await createProjectWithoutContractor(
          homeFiContract,
          tasksLibrary.address,
          '0x',
          tokenCurrency1,
          builders[i],
        ));
      expect(await homeFiContract.projects(count + 1)).to.equal(
        project.address,
      );
      expect(await homeFiContract.projectTokenId(project.address)).to.equal(
        count + 1,
      );
      await createTasks(project);
      let data: any = {
        types: ['address', 'address'],
        values: [contractors[i].address, project.address],
      };
      let [encodedData, signature] = await multisig(data, [
        builders[i],
        contractors[i],
      ]);
      let tx = await project
        .connect(builders[i])
        .inviteContractor(encodedData, signature);

      let projectCost = (
        await project.connect(builders[i]).projectCost()
      ).toNumber();
      await mockDAIContract.mock.transferFrom
        .withArgs(builders[i].address, project.address, projectCost)
        .returns(true);

      tx = await project.connect(builders[i]).lendToProject(projectCost);
      await expect(tx).to.emit(project, 'TaskAllocated').withArgs([1, 2, 3]);

      await project
        .connect(builders[i])
        .inviteSC([1], [subContractors[i].address]);

      await project.connect(subContractors[i]).acceptInviteSC([1]);
      const taskID = 1;
      data = {
        types: ['uint256', 'address'],
        values: [taskID, project.address],
      };

      await mockDAIContract.mock.transfer
        .withArgs(subContractors[i].address, taskCost)
        .returns(true);
      await mockDAIContract.mock.transfer
        .withArgs(treasury, taskCost / 1e3)
        .returns(true);

      // should revert with only B signature and SC != B
      if (builders[i].address != subContractors[i].address) {
        [encodedData, signature] = await multisig(data, [
          builders[i],
          builders[i],
          contractors[i],
        ]);
        const setComplete = project
          .connect(builders[i])
          .setComplete(encodedData, signature);
        await expect(setComplete).to.be.revertedWith(
          'Project::invalid signature',
        );
      }
      // should revert with only B signature and SC != C
      if (contractors[i].address != subContractors[i].address) {
        [encodedData, signature] = await multisig(data, [
          contractors[i],
          builders[i],
          contractors[i],
        ]);
        const setComplete = project
          .connect(builders[i])
          .setComplete(encodedData, signature);
        await expect(setComplete).to.be.revertedWith(
          'Project::invalid signature',
        );
      }

      // should revert with only GC signature and GC != B
      if (contractors[i].address != builders[i].address) {
        [encodedData, signature] = await multisig(data, [
          contractors[i],
          contractors[i],
          contractors[i],
        ]);
        const setComplete = project
          .connect(builders[i])
          .setComplete(encodedData, signature);
        await expect(setComplete).to.be.revertedWith(
          'Project::invalid signature',
        );
      }
      // should revert with only SC signature and SC != B
      if (subContractors[i].address != builders[i].address) {
        [encodedData, signature] = await multisig(data, [
          subContractors[i],
          subContractors[i],
          subContractors[i],
        ]);
        const setComplete = project
          .connect(builders[i])
          .setComplete(encodedData, signature);
        await expect(setComplete).to.be.revertedWith(
          'Project::invalid signature',
        );
      }

      [encodedData, signature] = await multisig(data, [
        builders[i],
        contractors[i],
        subContractors[i],
      ]);
      await project.connect(builders[i]).setComplete(encodedData, signature);
    }
  });
};
