import { expect } from 'chai';
import { MockContract } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { HomeFi } from '../artifacts/types/HomeFi';
import { Project } from '../artifacts/types/Project';

import { migrate, createProjectWithoutContractor, projectTests } from './utils';
const setup = async () => {
  let treasury: string;
  let lenderFee: number;
  let homeFiContract: HomeFi;
  let tokenCurrency1: any;
  let etherCurrency;
  let tasksLibrary;
  let project: Project;
  let mockDAIContract: MockContract;
  let mockETHContract: MockContract;
  let etherProject: Project;
  let project2: Project;
  let mockUSDCContract: MockContract;
  const signers = await ethers.getSigners();

  ({
    homeFiContract,
    treasury,
    lenderFee,
    mockDAIContract,
    mockUSDCContract,
    tasksLibrary,
    mockETHContract,
  } = await migrate());
  tokenCurrency1 = await homeFiContract.tokenCurrency1();
  etherCurrency = await homeFiContract.tokenCurrency3();
  treasury = await homeFiContract.treasury();

  expect(await homeFiContract.balanceOf(signers[0].address)).to.equal(
    await homeFiContract.projectCount(),
  );

  ({ projectContractInstance: project } = await createProjectWithoutContractor(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  ));
  expect(await homeFiContract.balanceOf(signers[0].address)).to.equal(
    await homeFiContract.projectCount(),
  );
  const projectId = await homeFiContract.projectTokenId(project.address);
  const owner = await homeFiContract.ownerOf(projectId);
  expect(owner).to.equal(signers[0].address);
  expect(await homeFiContract.projects(projectId)).to.equal(project.address);

  ({ projectContractInstance: etherProject } =
    await createProjectWithoutContractor(
      homeFiContract,
      tasksLibrary.address,
      '0x',
      etherCurrency,
    ));
  expect(await homeFiContract.balanceOf(signers[0].address)).to.equal(
    await homeFiContract.projectCount(),
  );
  const etherProjectId = await homeFiContract.projectTokenId(
    etherProject.address,
  );
  expect(await homeFiContract.ownerOf(etherProjectId)).to.equal(
    signers[0].address,
  );
  expect(await homeFiContract.projects(etherProjectId)).to.equal(
    etherProject.address,
  );
  ({ projectContractInstance: project2 } = await createProjectWithoutContractor(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  ));
  expect(await homeFiContract.balanceOf(signers[0].address)).to.equal(
    await homeFiContract.projectCount(),
  );
  const project2Id = await homeFiContract.projectTokenId(project2.address);
  expect(await homeFiContract.ownerOf(project2Id)).to.equal(signers[0].address);
  expect(await homeFiContract.projects(project2Id)).to.equal(project2.address);

  return [
    {
      treasury,
      lenderFee,
      homeFiContract,
      tokenCurrency1,
      etherCurrency,
      tasksLibrary,
      signers,
      project,
      mockDAIContract,
      mockETHContract,
      etherProject,
      project2,
      mockUSDCContract,
    },
  ];
};

setup().then(tests => {
  describe('Project', () => {
    tests.forEach(args => {
      projectTests(args);
    });
  });
  run();
});
