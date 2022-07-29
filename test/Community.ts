import { MockContract } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { Community } from '../artifacts/types/Community';
import { DebtToken } from '../artifacts/types/DebtToken';
import { HomeFi } from '../artifacts/types/HomeFi';
import { Project } from '../artifacts/types/Project';
import { migrate, createProject, communityTests } from './utils';

const setup = async () => {
  let treasury: any;
  let lenderFee: any;
  let communityContract: Community;
  let homeFiContract: HomeFi;
  let tokenCurrency1: string;
  let nativeCurrency: string;
  let tasksLibrary;
  let project: Project;
  let project2: Project;
  let mockETHContract: MockContract;
  let mockDAIContract: MockContract;
  let rDAIContract: DebtToken;
  let rETHContract: DebtToken;
  let etherProject: Project;
  const signers = await ethers.getSigners();
  ({
    communityContract,
    homeFiContract,
    treasury,
    lenderFee,
    mockETHContract,
    mockDAIContract,
    rDAIContract,
    rETHContract,
    tasksLibrary,
  } = await migrate());

  tokenCurrency1 = await homeFiContract.tokenCurrency1();
  nativeCurrency = await homeFiContract.tokenCurrency3();

  ({ projectContractInstance: project } = await createProject(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  ));
  ({ projectContractInstance: project2 } = await createProject(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  ));
  ({ projectContractInstance: etherProject } = await createProject(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    nativeCurrency,
  ));
  // top-level await: Node >= v14.8.0 with ESM test file
  return [
    {
      signers,
      treasury,
      lenderFee,
      communityContract,
      homeFiContract,
      tokenCurrency1,
      nativeCurrency,
      project,
      project2,
      mockETHContract,
      mockDAIContract,
      rDAIContract,
      rETHContract,
      etherProject,
      tasksLibrary,
    },
  ];
};
setup().then(tests => {
  describe('Community', async () => {
    tests.forEach(args => {
      communityTests(args);
    });
  });
  run();
});
