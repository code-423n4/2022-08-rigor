import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { MockContract } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { Disputes } from '../artifacts/types/Disputes';
import { HomeFi } from '../artifacts/types/HomeFi';
import { Project } from '../artifacts/types/Project';
import {
  migrate,
  builderLend,
  disputeTests,
  createProjectWithoutContractor,
} from './utils';

/**
 * @title Disputes
 * @version v0.2.1-HomeFi
 *
 * Unit testing for HomeFi dispute arbitration. In disputed multi signature functions, administrator can arbitrate
 * and resolve according to their judgement. See IDisputes and IProject for more details on parameter encoding if
 * it isn't clear here how to encode function calls.
 *
 * @dev in future version, most likely need auto checking of dispute params. In this version admin will just reject
 *
 * Coverage:
 *  - Roll-based auth on all dispute integrations
 *  - Outcome execution verification for approved/rejected disputes in project contract
 *  - Verify expected events and reverts
 *  - Attach documents to dispute
 */
const setup = async () => {
  let signers: SignerWithAddress[]; // ethers signers
  let mockDAIContract: MockContract;
  let tokenCurrency1: string; // dai erc20 mock / address
  let homeFiContract: HomeFi;
  let disputesContract: Disputes;
  let tasksLibrary; // on-chain libraries
  let project: Project; // project address / factory-attached contract instance of project
  let project2: Project;
  let treasury: string; // beneficiary / owner of HomeFi
  const exampleHash = '0x1234'; // required for task add - dummy data
  signers = await ethers.getSigners();
  ({
    homeFiContract,
    disputesContract,
    mockDAIContract,
    tasksLibrary,
    treasury,
  } = await migrate());

  tokenCurrency1 = await homeFiContract.tokenCurrency1();
  ({ projectContractInstance: project } = await createProjectWithoutContractor(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  )); //create project to use during test

  // enroll general contractor
  await builderLend(project, mockDAIContract, signers[0]);

  ({ projectContractInstance: project2 } = await createProjectWithoutContractor(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  )); //create project to use during test

  // enroll general contractor

  return [
    {
      signers,
      mockDAIContract,
      disputesContract,
      project,
      project2,
      treasury,
      exampleHash,
    },
  ];
};

setup().then(tests => {
  describe('Disputes', async () => {
    tests.forEach(args => {
      disputeTests(args);
    });
  });
  run();
});
