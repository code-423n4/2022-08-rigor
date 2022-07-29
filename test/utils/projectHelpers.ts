import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { multisig } from '.';
import { HomeFi } from '../../artifacts/types/HomeFi';
import { Project } from '../../artifacts/types/Project';

export async function createTasks(projectContractInstance: Project) {
  const signers = await ethers.getSigners();
  const hashArray = ['0x', '0x', '0x'];
  const costArray = [1e11, 1e11, 1e11];
  const data = {
    types: ['bytes[]', 'uint256[]', 'uint256', 'address'],
    values: [
      hashArray,
      costArray,
      await projectContractInstance.taskCount(),
      projectContractInstance.address,
    ],
  };
  const [encodedData, signature] = await multisig(data, [signers[0]]);

  await projectContractInstance.addTasks(encodedData, signature);
}

/**
 * Create a new project
 * @param {ethers.Contract} homeFiContract - HomeFi NFT / admin entry point Contract
 * @notice expects signer to be connected - call like 'await createProject(homeFiContract.connect)
 * @param {string} tasksLibraryAddress - address of the tasks library used on-chain
 * @param {string} hash - the identifying hash of the project
 * @param {string} currency - address of the collateral currency used in project
 * @returns
 */
export async function createProject(
  homeFiContract: HomeFi,
  tasksLibraryAddress: string,
  hash: string,
  currency: string,
): Promise<any> {
  const signers = await ethers.getSigners();
  let tx = await homeFiContract
    .connect(signers[0])
    .createProject(hash, currency);
  const receipt = await tx.wait();
  const event = receipt.events?.find(x => x.event === 'ProjectAdded');
  const project = event?.args?._project;
  const builder = signers[0].address;
  const contractor = signers[1].address;

  const ProjectContractFactory = await ethers.getContractFactory('Project', {
    libraries: {
      Tasks: tasksLibraryAddress,
    },
  });
  const data = {
    types: ['address', 'address'],
    values: [contractor, project],
  };
  const [encodedData, signature] = await multisig(data, [
    signers[0],
    signers[1],
  ]);
  const projectContractInstance = ProjectContractFactory.attach(
    project,
  ) as Project;
  await createTasks(projectContractInstance);
  await projectContractInstance.inviteContractor(encodedData, signature);
  return { projectContractInstance, project, builder, contractor };
}

/**
 * As a builder, lent in a project using mock dai
 * @notice method automatically computes needed lending needed & sends
 * @param {Object} project - ethers project contract (should be attached to project factory)
 * @param {Object} dai - Dai mock contract
 * @param {Object} signer - Ethers wallet signing as builder
 * @param {number} amount - quantity of dai to lent
 * @return {Promise<number>} - return amount mock lent
 */
export async function builderLend(
  project: any,
  dai: any,
  signer: SignerWithAddress,
): Promise<any> {
  let cost = await project.projectCost();
  let lending = await project.totalLent();
  if (Number(lending.toString()) >= Number(cost.toString()))
    // return 0 if no lending needed
    return 0;
  // compute total lending needed
  const amount = cost - lending;
  // mock transfer and project lending
  await dai.mock.transferFrom
    .withArgs(signer.address, project.address, amount)
    .returns(true);
  const tx = await project.connect(signer).lendToProject(amount);
  cost = await project.projectCost();
  lending = await project.totalLent();
  return amount;
}

/**
 * Create a new project without calling invite contractor
 * @param {ethers.Contract} homeFiContract - HomeFi NFT / admin entry point Contract
 * @notice expects signer to be connected - call like 'await createProject(homeFiContract.connect)
 * @param {string} tasksLibraryAddress - address of the tasks library used on-chain
 * @param {string} hash - the identifying hash of the project
 * @param {string} currency - address of the collateral currency used in project
 * @returns
 */
export async function createProjectWithoutContractor(
  homeFiContract: HomeFi,
  tasksLibraryAddress: string,
  hash: string,
  currency: string,
  builderSigner?: SignerWithAddress,
): Promise<any> {
  const signers = await ethers.getSigners();
  let tx = await homeFiContract
    .connect(builderSigner || signers[0])
    .createProject(hash, currency);
  const receipt = await tx.wait();
  const event = receipt.events?.find(x => x.event === 'ProjectAdded');
  const project = event?.args?._project;
  const builder = builderSigner?.address || signers[0].address;
  const ProjectContractFactory = await ethers.getContractFactory('Project', {
    libraries: {
      Tasks: tasksLibraryAddress,
    },
  });
  const projectContractInstance = await ProjectContractFactory.attach(project);
  return { projectContractInstance, builder, project };
}

export function calculateNewTotalAllocated(
  oldTotalAllocated: number,
  oldCost: number[],
  newCost: number[],
): any {
  let reduceAllocation = 0;
  for (let i = 0; i < newCost.length; i++) {
    if (oldCost[i] > newCost[i]) {
      reduceAllocation += oldCost[i] - newCost[i];
    } else {
      reduceAllocation += oldCost[i];
    }
  }
  return (oldTotalAllocated -= reduceAllocation);
}
