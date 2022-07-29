import { ethers } from 'hardhat';
import { DebtToken } from '../artifacts/types/DebtToken';
import { ProjectFactory } from '../artifacts/types/ProjectFactory';
import { migrate, projectFactoryTests } from './utils';
const setup = async () => {
  const signers = await ethers.getSigners();
  let projectFactoryContract: ProjectFactory;
  let rDAIContract: DebtToken;
  ({ rDAIContract, projectFactoryContract } = await migrate());
  // top-level await: Node >= v14.8.0 with ESM test file
  return [
    {
      projectFactoryContract,
      signers,
      rDAIContract,
    },
  ];
};

setup().then(tests => {
  describe('ProjectFactory', async () => {
    tests.forEach(args => {
      projectFactoryTests(args);
    });
  });
  run();
});
