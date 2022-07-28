import { expect } from 'chai';
import { createProject } from '.';
import { ProjectV2Mock } from '../../artifacts/types/ProjectV2Mock';
import { HomeFi } from '../../artifacts/types/HomeFi';
import { Project } from '../../artifacts/types/Project';
import { getContractAt } from './ethersHelpers';
import { ethers } from 'hardhat';

export const projectUpgradabilityTests = async ({
  homeFiContract,
  project,
  tokenCurrency1,
  tasksLibrary,
}: {
  homeFiContract: HomeFi;
  project: Project;
  tokenCurrency1: string;
  tasksLibrary: any;
}) => {
  let projectV2MockContract: ProjectV2Mock;
  it('should revert when call V2 function from V1 project', async () => {
    const abi = new ethers.utils.Interface(['function newVariable()']);
    const oldProjectContract = new ethers.Contract(
      project.address,
      abi,
      (await ethers.getSigners())[0],
    );
    await expect(oldProjectContract.newVariable()).to.be.revertedWith(
      "function selector was not recognized and there's no fallback function",
    );
  });
  it('should be able to deploy upgraded Project', async () => {
    const projectV2MockAddress = (
      await createProject(
        homeFiContract,
        tasksLibrary.address,
        '0x',
        tokenCurrency1,
      )
    ).project;
    projectV2MockContract = await getContractAt<ProjectV2Mock>(
      'ProjectV2Mock',
      projectV2MockAddress,
    );
  });

  it('should be able to retrieve new state variable', async () => {
    expect(await projectV2MockContract.newVariable()).to.equal(false);
  });

  it('should be able to call newly added functions', async () => {
    const tx = await projectV2MockContract.setNewVariable();
    expect(await projectV2MockContract.newVariable()).to.equal(true);
  });
};
