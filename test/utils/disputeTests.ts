import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Disputes } from '../../artifacts/types/Disputes';
import {
  builderLend,
  makeDispute,
  encodeData,
  multisig,
  types,
  abiCoder,
} from '.';
import { deploy } from './ethersHelpers';
import { Project } from '../../artifacts/types/Project';
import { MockContract } from 'ethereum-waffle';

export const disputeTests = async ({
  signers,
  mockDAIContract,
  disputesContract,
  project,
  project2,
  treasury,
  exampleHash,
}: {
  signers: SignerWithAddress[];
  mockDAIContract: MockContract;
  disputesContract: Disputes;
  project: Project;
  project2: Project;
  treasury: string;
  exampleHash: string;
}) => {
  let projectAddress = project.address;
  let project2Address = project2.address;
  it('should revert when initialize with zero address', async () => {
    const disputeImplementation = await deploy<Disputes>('Disputes');
    await disputeImplementation.deployed();
    const tx = disputeImplementation.initialize(ethers.constants.AddressZero);
    await expect(tx).to.be.revertedWith('Disputes::0 address');
  });

  describe('Disputed addTasks()', async () => {
    it('Normal addTasks() multi signature (GC, Builder)', async () => {
      const hashArray = ['0x'];
      const costArray = [200000000000];

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
      await (await project.addTasks(encodedData, signature)).wait();

      //make up difference in cost and lending
      await builderLend(project, mockDAIContract, signers[0]);
    });
    it('Cannot raise dispute with invalid project address', async () => {
      // build reverting add task transaction
      const actionValues = [[exampleHash], [400000000000], 1, projectAddress];
      const [encodedData, signature] = await makeDispute(
        signers[2].address, // invalid address
        0,
        1,
        actionValues,
        signers[2],
        '0x4a5a',
      );
      const tx = project
        .connect(signers[2])
        .raiseDispute(encodedData, signature);
      // expect add task transaction to fail
      await expect(tx).to.be.revertedWith('Project::!projectAddress');
    });
    it('Cannot raise addTasks() dispute if not member (GC, Builder)', async () => {
      // build reverting add task transaction
      const actionValues = [[exampleHash], [400000000000], 1, projectAddress];
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        0,
        1,
        actionValues,
        signers[2],
        '0x4a5a',
      );
      const tx = project
        .connect(signers[2])
        .raiseDispute(encodedData, signature);
      // expect add task transaction to fail
      await expect(tx).to.be.revertedWith('Project::!(GC||Builder)');
    });
    it('General Contractor can raise addTasks() dispute', async () => {
      // Add GC
      const data = {
        types: ['address', 'address'],
        values: [signers[1].address, project.address],
      };
      const [encodedDataAddGC, signatureAddGC] = await multisig(data, [
        signers[0],
        signers[1],
      ]);
      const txAddGC = await project.inviteContractor(
        encodedDataAddGC,
        signatureAddGC,
      );
      await txAddGC.wait();

      let expected = 1;
      const actionValues = [[exampleHash], [500000000000], 1, projectAddress];
      // build and raise dispute transaction
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        0,
        1,
        actionValues,
        signers[1],
        '0x43f5',
      );

      expect(await disputesContract.disputeCount()).to.be.equal(0);

      let tx = await project
        .connect(signers[1])
        .raiseDispute(encodedData, signature);
      // expect event
      await expect(tx)
        .to.emit(disputesContract, 'DisputeRaised')
        .withArgs(0, '0x43f5');
      // expect dispute raise to store info
      const _dispute = await disputesContract.disputes(0);
      const decodedAction = abiCoder.decode(types.taskAdd, _dispute.actionData);
      expect(_dispute.status).to.be.equal(1);
      expect(_dispute.taskID).to.be.equal(0);
      expect(decodedAction[0][0]).to.be.equal(exampleHash);
      expect(decodedAction[1][0]).to.be.equal(500000000000);
      expect(decodedAction[2]).to.be.equal(1);
      expect(decodedAction[3]).to.be.equal(projectAddress);
      expect(await disputesContract.disputeCount()).to.be.equal(1);
      // expect unchanged number of tasks
      let taskCount = await project.taskCount();
      expect(taskCount).to.be.equal(expected);
    });
    it('Cannot resolve dispute if not administrator', async () => {
      // build resolve with unauthorized signer
      const tx = disputesContract
        .connect(signers[1])
        .resolveDispute(0, '0xe2d1', true);
      // expect resolve transaction to fail
      await expect(tx).to.be.revertedWith('Disputes::!Admin');
      // expect no change to transaction state
      let taskCount = await project.taskCount();
      expect(taskCount).to.be.equal(1);
    });
    it('Administrator can approve a dispute and execute addTasks()', async () => {
      const tx = await disputesContract
        .connect(signers[0])
        .resolveDispute(0, '0xee92', true);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeResolved')
        .withArgs(0, true, '0xee92');
      // expect dispute state updated to reflect arbitration
      const _dispute = await disputesContract.disputes(0);
      expect(_dispute.status).to.be.equal(2);
      expect(_dispute.taskID).to.be.equal(0); //no task id since does not exist before dispute executes
      const task = await project.getTask(2);
      const expected = 2;
      const taskCount = await project.taskCount();
      expect(taskCount).to.equal(expected);
      expect(task.cost).to.equal(500000000000);
      expect(task.state).to.equal(1);
      //make up difference in cost and lending
      await builderLend(project, mockDAIContract, signers[0]);
    });
    it('Builder can raise addTasks() dispute', async () => {
      let expected = 2;
      const actionValues = [
        [exampleHash],
        [100000000000],
        expected,
        projectAddress,
      ];
      // build and raise dispute transaction
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        0,
        1,
        actionValues,
        signers[0],
        '0x4222',
      );
      let tx = await project
        .connect(signers[1])
        .raiseDispute(encodedData, signature);
      // expect event
      await expect(tx)
        .to.emit(disputesContract, 'DisputeRaised')
        .withArgs(1, '0x4222');
      // expect dispute raise to store info
      const _dispute = await disputesContract.disputes(1);
      const decodedAction = abiCoder.decode(types.taskAdd, _dispute.actionData);
      expect(_dispute.status).to.be.equal(1);
      expect(_dispute.taskID).to.be.equal(0);
      expect(decodedAction[0][0]).to.be.equal(exampleHash);
      expect(decodedAction[1][0]).to.be.equal(100000000000);
      expect(decodedAction[2]).to.be.equal(expected);
      expect(decodedAction[3]).to.be.equal(projectAddress);
      // expect unchanged number of tasks
      let taskCount = await project.taskCount();
      expect(taskCount).to.be.equal(expected);
    });
    it('Administrator can reject addTasks() dispute with no state change', async () => {
      // resolve and reject dispute
      const tx = await disputesContract
        .connect(signers[0])
        .resolveDispute(1, '0xca47', false);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeResolved')
        .withArgs(1, false, '0xca47');
      // check for dispute state update
      const _dispute = await disputesContract.disputes(1);
      expect(_dispute.status).to.be.equal(3);
      expect(_dispute.taskID).to.be.equal(0);
      // expect old general contractor compensation state
      let taskCount = await project.taskCount();
      expect(taskCount).to.be.equal(2);
    });
    it('addTasks() dispute actions are not reusable', async () => {
      // try to reject approved dispute
      let tx = disputesContract
        .connect(signers[0])
        .resolveDispute(0, '0x0101', false);
      await expect(tx).to.be.revertedWith('Disputes::!Resolvable');
      // try to approve rejected dispute
      tx = disputesContract
        .connect(signers[0])
        .resolveDispute(1, '0x1010', true);
      await expect(tx).to.be.revertedWith('Disputes::!Resolvable');
    });
  });

  describe('Disputed changeOrder()', async () => {
    it('Normal changeOrder() multi signature (SC, GC, Builder)', async () => {
      // invite subcontractors to existing tasks
      let tx = await project
        .connect(signers[0])
        .inviteSC([1, 2], [signers[2].address, signers[2].address]);
      tx = await project.connect(signers[2]).acceptInviteSC([1, 2]);
      // expect old task state
      let cost = 200000000000;
      let state = await project.getTask(1);
      expect(state.cost).to.equal(cost);
      expect(state.subcontractor).to.equal(signers[2].address);
      expect(state.state).to.equal(2);
      // build change order transaction
      cost = 100000000000;
      const data = {
        types: types.taskChange,
        values: [1, signers[2].address, cost, projectAddress],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[0],
        signers[1],
        signers[2],
      ]);
      // mock dai payout + task pay reduced
      await mockDAIContract.mock.transfer
        .withArgs(signers[0].address, cost)
        .returns(true);
      tx = await project
        .connect(signers[0])
        .changeOrder(encodedData, signature);
      await expect(tx)
        .to.emit(project, 'ChangeOrderFee')
        .withArgs(1, 100000000000);
      // expect new task state
      state = await project.getTask(1);
      expect(state.cost).to.equal(cost);
      expect(state.subcontractor).to.equal(signers[2].address);
      expect(state.state).to.equal(2);
    });
    it('Cannot raise addTasks() dispute if not member (SC, GC, Builder)', async () => {
      // build failing change order dispute transaction
      const actionValues = [
        1,
        signers[3].address,
        500000000000,
        projectAddress,
      ];
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        2,
        2,
        actionValues,
        signers[3],
        '0xabcd',
      );
      let tx = project.connect(signers[3]).raiseDispute(encodedData, signature);
      // expect transaction to revert
      await expect(tx).to.be.revertedWith('Project::!(GC||Builder||SC)');
    });
    it('Subcontractor cannot raise addTasks() dispute if not accepted', async () => {
      await builderLend(project2, mockDAIContract, signers[0]);
      let tx;

      let data = {
        types: types.taskAdd,
        values: [[exampleHash, exampleHash], [2e11, 2e11], 0, project2Address],
      };
      let [encodedData, signature] = await multisig(data, [
        signers[0],
        signers[1],
      ]);
      tx = await project2.connect(signers[0]).addTasks(encodedData, signature);
      tx = await project2
        .connect(signers[0])
        .inviteSC([1, 2], [signers[2].address, signers[2].address]);
      // build failing change order dispute transaction
      const actionValues = [
        1,
        signers[3].address,
        500000000000,
        project2Address,
      ];
      [encodedData, signature] = await makeDispute(
        project2Address,
        2,
        2,
        actionValues,
        signers[2],
        '0xabcd',
      );
      tx = project2.connect(signers[2]).raiseDispute(encodedData, signature);
      // expect transaction to revert
      await expect(tx).to.be.revertedWith('Project::!SCConfirmed');
    });
    it('Subcontractor can raise changeOrder() dispute', async () => {
      // expect old task state
      const expected = {
        task: 1,
        subcontractor: signers[2].address,
        cost: 100000000000,
        reason: '0x9876',
        judgement: '0x9284',
      };
      let state = await project.getTask(1);
      expect(state.subcontractor).to.be.equal(expected.subcontractor);
      expect(Number(state.cost)).to.be.equal(expected.cost);
      // build dispute raise transaction
      const actionValues = [
        1,
        signers[3].address,
        expected.cost * 3,
        projectAddress,
      ];
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        1,
        2,
        actionValues,
        signers[2],
        expected.reason,
      );
      // raise change order dispute
      let tx = await project
        .connect(signers[2])
        .raiseDispute(encodedData, signature);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeRaised')
        .withArgs(2, expected.reason);
      // expect dispute active
      const _dispute = await disputesContract.disputes(2);
      const decodedAction = abiCoder.decode(
        types.taskChange,
        _dispute.actionData,
      );
      expect(_dispute.status).to.be.equal(1);
      expect(_dispute.taskID).to.be.equal(1);
      expect(_dispute.raisedBy).to.be.equal(signers[2].address);
      expect(decodedAction[0]).to.be.equal(1);
      expect(decodedAction[1]).to.be.equal(signers[3].address);
      expect(decodedAction[2]).to.be.equal(expected.cost * 3);
      expect(decodedAction[3]).to.be.equal(projectAddress);
      // expect old task state
      state = await project.getTask(1);
      expect(state.cost).to.be.equal(expected.cost);
    });
    it('Cannot resolve dispute if not administrator', async () => {
      // build resolve with unauthorized signer
      const tx = disputesContract
        .connect(signers[1])
        .resolveDispute(2, '0xe2d1', true);
      // expect resolve transaction to fail
      await expect(tx).to.be.revertedWith('Disputes::!Admin');
      // expect no change to transaction state
      let taskCount = await project.taskCount();
      expect(taskCount).to.be.equal(2);
    });
    it('Administrator can approve a dispute and execute changeOrder()', async () => {
      // expect old task and dispute state
      const expected = {
        task: 2,
        subcontractor: signers[3].address,
        cost: 100000000000,
        reason: '0x9876',
        judgement: '0x9284',
      };
      let state = await project.getTask(1);
      expect(state.subcontractor).to.be.equal(signers[2].address);
      expect(Number(state.cost)).to.be.equal(expected.cost);
      expect((await project.getTask(1)).state).to.equal(2);
      // build resolve approval transaction
      let tx = await disputesContract
        .connect(signers[0])
        .resolveDispute(2, expected.judgement, true);
      await expect(tx)
        .to.emit(project, 'ChangeOrderFee')
        .withArgs(1, 300000000000);
      await expect(tx)
        .to.emit(project, 'ChangeOrderSC')
        .withArgs(1, signers[3].address);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeResolved')
        .withArgs(2, true, expected.judgement);
      // expect new task and dispute state
      const _dispute = await disputesContract.disputes(2);
      state = await project.getTask(1);
      expect(_dispute.status).to.be.equal(2);
      expect(state.subcontractor).to.be.equal(expected.subcontractor);
      expect(Number(state.cost)).to.be.equal(expected.cost * 3);
      // builder lent to refund according to changed task required funding
      await builderLend(project, mockDAIContract, signers[0]);
      // expect state to have reverted on cost increase / change in SC
      await project.allocateFunds();
      expect((await project.getTask(1)).state).to.equal(1);
      tx = await project.connect(signers[3]).acceptInviteSC([1]);
      expect((await project.getTask(1)).state).to.equal(2);
    });
    it('Builder can raise changeOrder() dispute', async () => {
      // build dispute raise transaction
      const actionValues = [
        1,
        signers[2].address,
        100000000000,
        projectAddress,
      ];
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        1,
        2,
        actionValues,
        signers[0],
        '0x98dd',
      );
      // raise change order dispute
      let tx = await project
        .connect(signers[0])
        .raiseDispute(encodedData, signature);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeRaised')
        .withArgs(3, '0x98dd');
      // expect dispute active
      const _dispute = await disputesContract.disputes(3);
      const decodedAction = abiCoder.decode(
        types.taskChange,
        _dispute.actionData,
      );
      expect(_dispute.status).to.be.equal(1);
      expect(_dispute.taskID).to.be.equal(1);
      expect(_dispute.raisedBy).to.be.equal(signers[0].address);
      expect(decodedAction[0]).to.be.equal(1);
      expect(decodedAction[1]).to.be.equal(signers[2].address);
      expect(decodedAction[2]).to.be.equal(100000000000);
      expect(decodedAction[3]).to.be.equal(projectAddress);
      // expect old task state
      const state = await project.getTask(1);
      expect(state.cost).to.be.equal(300000000000);
    });
    it('General Contractor can raise setComplete() dispute', async () => {
      // build dispute raise transaction
      const actionValues = [
        1,
        signers[2].address,
        900000000000,
        projectAddress,
      ];
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        1,
        2,
        actionValues,
        signers[1],
        '0x98d3',
      );
      // raise change order dispute
      let tx = await project
        .connect(signers[1])
        .raiseDispute(encodedData, signature);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeRaised')
        .withArgs(4, '0x98d3');
      // expect dispute active
      const _dispute = await disputesContract.disputes(4);
      const decodedAction = abiCoder.decode(
        types.taskChange,
        _dispute.actionData,
      );
      expect(_dispute.status).to.be.equal(1);
      expect(_dispute.taskID).to.be.equal(1);
      expect(_dispute.raisedBy).to.be.equal(signers[1].address);
      expect(decodedAction[0]).to.be.equal(1);
      expect(decodedAction[1]).to.be.equal(signers[2].address);
      expect(decodedAction[2]).to.be.equal(900000000000);
      expect(decodedAction[3]).to.be.equal(projectAddress);
      // expect old task state
      const state = await project.getTask(1);
      expect(state.cost).to.be.equal(300000000000);
    });
    it('Administrator can reject changeOrder() dispute with no state change', async () => {
      // send dispute resolve transaction
      const tx = await disputesContract
        .connect(signers[0])
        .resolveDispute(3, '0xee42', false);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeResolved')
        .withArgs(3, false, '0xee42');
      // expect dispute state updated to reflect arbitration
      const _dispute = await disputesContract.disputes(3);
      expect(_dispute.status).to.be.equal(3);
      expect(_dispute.taskID).to.be.equal(1);
      const task = await project.getTask(1);
      expect(task.cost).to.equal(300000000000);
      expect(task.state).to.equal(2);
    });
    it('changeOrder() dispute actions are not reusable', async () => {
      // try to reject approved dispute
      let tx = disputesContract
        .connect(signers[0])
        .resolveDispute(2, '0x0101', false);
      await expect(tx).to.be.revertedWith('Disputes::!Resolvable');
      // try to approve rejected dispute
      tx = disputesContract
        .connect(signers[0])
        .resolveDispute(2, '0x1010', true);
      await expect(tx).to.be.revertedWith('Disputes::!Resolvable');
    });
  });

  describe('Disputed setComplete()', () => {
    it('Normal setComplete() multi signature (SC, GC, Builder)', async () => {
      // expect old task completion state
      let state = await project.getTask(1);
      expect(state.state).to.be.equal(2);
      // build and sign setComplete transaction params
      const data = {
        types: types.taskPay,
        values: [1, projectAddress],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[0],
        signers[1],
        signers[3],
      ]);
      // mock dai task payout and set task as complete
      await mockDAIContract.mock.transfer
        .withArgs(signers[3].address, 300000000000)
        .returns(true);
      let tx = await project
        .connect(signers[0])
        .setComplete(encodedData, signature);
      await expect(tx).to.emit(project, 'TaskComplete').withArgs(1);
      state = await project.getTask(1);
      expect(state.state).to.be.equal(3);
    });
    it('Cannot raise setComplete() dispute if not member (SC, GC, Builder)', async () => {
      // build dispute raise with unauthorized signer
      const actionValues = [2, projectAddress];
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        2,
        3,
        actionValues,
        signers[3],
        '0xa16b',
      );
      const tx = project
        .connect(signers[3])
        .raiseDispute(encodedData, signature);
      // expect tx to revert
      await expect(tx).to.be.revertedWith('Project::!(GC||Builder||SC)');
    });
    it('Subcontractor can raise setComplete() dispute', async () => {
      // expect old task completion state
      let state = await project.getTask(2);
      expect(state.state).to.be.equal(2);
      // build dispute raise transaction
      const actionValues = [2, projectAddress];
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        2,
        3,
        actionValues,
        signers[2],
        '0xa16c',
      );
      const tx = await project
        .connect(signers[2])
        .raiseDispute(encodedData, signature);
      // expect event
      await expect(tx)
        .to.emit(disputesContract, 'DisputeRaised')
        .withArgs(5, '0xa16c');
      // expect dispute active
      const _dispute = await disputesContract.disputes(5);
      const decodedAction = abiCoder.decode(types.taskPay, _dispute.actionData);
      expect(_dispute.status).to.be.equal(1);
      expect(_dispute.taskID).to.be.equal(2);
      expect(_dispute.raisedBy).to.be.equal(signers[2].address);
      expect(decodedAction[0]).to.be.equal(2);
      expect(decodedAction[1]).to.be.equal(projectAddress);
      // expect old task completion state
      state = await project.getTask(2);
      expect(state.state).to.be.equal(2);
    });
    it('Cannot resolve dispute if not administrator', async () => {
      // build resolve with unauthorized signer
      const tx = disputesContract
        .connect(signers[1])
        .resolveDispute(5, '0x3ea1', false);
      // expect resolve transaction to fail
      await expect(tx).to.be.revertedWith('Disputes::!Admin');
      // expect old task completion state
      let state = await project.getTask(2);
      expect(state.state).to.be.equal(2);
    });
    it('Administrator can approve a dispute and execute setComplete()', async () => {
      // mock dai task payout and set task as complete
      await mockDAIContract.mock.transfer
        .withArgs(signers[2].address, 500000000000)
        .returns(true);
      const tx = await disputesContract
        .connect(signers[0])
        .resolveDispute(5, '0x3ed2', true);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeResolved')
        .withArgs(5, true, '0x3ed2');
      await expect(tx).to.emit(project, 'TaskComplete').withArgs(2);
      // expect new task and dispute state
      const _dispute = await disputesContract.disputes(5);
      const state = await project.getTask(2);
      expect(_dispute.status).to.be.equal(2);
      expect(state.state).to.equal(3);
    });
    it('Builder can raise Task Payout dispute', async () => {
      // add / fund / join new task
      let data = {
        types: types.taskAdd,
        values: [[exampleHash], [200000000000], 2, projectAddress],
      };
      let [encodedData, signature] = await multisig(data, [
        signers[0],
        signers[1],
      ]);
      let tx = await project
        .connect(signers[0])
        .addTasks(encodedData, signature);
      await builderLend(project, mockDAIContract, signers[0]);
      tx = await project
        .connect(signers[0])
        .inviteSC([3], [signers[2].address]);
      tx = await project.connect(signers[2]).acceptInviteSC([3]);
      // build dispute raise transaction
      const actionValues = [3, projectAddress];
      [encodedData, signature] = await makeDispute(
        projectAddress,
        3,
        3,
        actionValues,
        signers[0],
        '0xb16c',
      );
      tx = await project
        .connect(signers[0])
        .raiseDispute(encodedData, signature);
      // expect event
      await expect(tx)
        .to.emit(disputesContract, 'DisputeRaised')
        .withArgs(6, '0xb16c');
      // expect dispute active
      const _dispute = await disputesContract.disputes(6);
      const decodedAction = abiCoder.decode(types.taskPay, _dispute.actionData);
      expect(_dispute.status).to.be.equal(1);
      expect(_dispute.taskID).to.be.equal(3);
      expect(_dispute.raisedBy).to.be.equal(signers[0].address);
      expect(decodedAction[0]).to.be.equal(3);
      expect(decodedAction[1]).to.be.equal(projectAddress);
      // expect old task completion state
      const state = await project.getTask(3);
      expect(state.state).to.be.equal(2);
    });
    it('General Contractor can raise Task Payout dispute', async () => {
      // build dispute raise transaction
      const actionValues = [3, projectAddress];
      const [encodedData, signature] = await makeDispute(
        projectAddress,
        3,
        3,
        actionValues,
        signers[1],
        '0xc26c',
      );
      const tx = await project
        .connect(signers[1])
        .raiseDispute(encodedData, signature);
      // expect event
      await expect(tx)
        .to.emit(disputesContract, 'DisputeRaised')
        .withArgs(7, '0xc26c');
      // expect dispute active
      const _dispute = await disputesContract.disputes(7);
      const decodedAction = abiCoder.decode(types.taskPay, _dispute.actionData);
      expect(_dispute.status).to.be.equal(1);
      expect(_dispute.taskID).to.be.equal(3);
      expect(_dispute.raisedBy).to.be.equal(signers[1].address);
      expect(decodedAction[0]).to.be.equal(3);
      expect(decodedAction[1]).to.be.equal(projectAddress);
      // expect old task completion state
      const state = await project.getTask(3);
      expect(state.state).to.be.equal(2);
    });
    it('Administrator can reject setComplete() dispute with no state change', async () => {
      // send dispute resolve transaction
      const tx = await disputesContract
        .connect(signers[0])
        .resolveDispute(6, '0xaa29', false);
      await expect(tx)
        .to.emit(disputesContract, 'DisputeResolved')
        .withArgs(6, false, '0xaa29');
      // expect dispute state updated to reflect arbitration
      const _dispute = await disputesContract.disputes(6);
      expect(_dispute.status).to.be.equal(3);
      expect(_dispute.taskID).to.be.equal(3);
      const task = await project.getTask(3);
      expect(task.state).to.equal(2);
    });
    it('setComplete() dispute actions are not reusable', async () => {
      // try to reject approved dispute
      let tx = disputesContract
        .connect(signers[0])
        .resolveDispute(5, '0x1212', false);
      await expect(tx).to.be.revertedWith('Disputes::!Resolvable');
      // try to approve rejected dispute
      tx = disputesContract
        .connect(signers[0])
        .resolveDispute(6, '0x1314', true);
      await expect(tx).to.be.revertedWith('Disputes::!Resolvable');
    });
  });

  describe('Document Attachment', async () => {
    it('Cannot attach document to nonexistent dispute', async () => {
      const tx = disputesContract
        .connect(signers[0])
        .attachDocument(200, '0xcccc');
      await expect(tx).to.be.revertedWith('Disputes::!Resolvable');
    });
    it('Cannot attach document if not member on dispute', async () => {
      const tx = disputesContract
        .connect(signers[5])
        .attachDocument(7, '0xcccc');
      await expect(tx).to.be.revertedWith('Disputes::!Member');
    });
    it("Disputes participants can attach CID's of document", async () => {
      const tx = await disputesContract
        .connect(signers[0])
        .attachDocument(7, '0xbbbb');
      await expect(tx)
        .to.emit(disputesContract, 'DisputeAttachmentAdded')
        .withArgs(7, signers[0].address, '0xbbbb');
    });
  });

  describe('Miscellaneous Testing', async () => {
    it('Cannot raise dispute from non-project address', async () => {
      // build and raise valid dispute transaction
      const actionValues = [[exampleHash], [600000000000], 3, projectAddress];

      const [encodedData, signature] = await makeDispute(
        projectAddress,
        0,
        1,
        actionValues,
        signers[0],
        '0xabc3',
      );
      // expect dispute to fail when not sent through project contract
      let tx = disputesContract
        .connect(signers[0])
        .raiseDispute(encodedData, signature);
      await expect(tx).to.be.revertedWith('Disputes::!Project');
    });
    it('Cannot raise dispute with invalid ActionType', async () => {
      // build and raise invalid dispute transaction
      const actionData = {
        types: ['address'],
        values: [projectAddress],
      };
      const encodedActionData = encodeData(actionData);
      const data = {
        types: types.dispute,
        values: [projectAddress, 0, 9, encodedActionData, '0x'],
      };
      const [encodedData, signature] = await multisig(data, [signers[0]]);
      // expect dispute to fail when not sent through project contract
      let tx = project.connect(signers[0]).raiseDispute(encodedData, signature);
      await expect(tx).to.be.revertedWith('Disputes::!ActionType');
    });
  });
};
