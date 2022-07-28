import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { DebtToken } from '../artifacts/types/DebtToken';
import { debtTokenTests, migrate } from './utils';

const setup = async () => {
  let signers: SignerWithAddress[];
  let rDAIContract: DebtToken;
  let rUSDCContract: DebtToken;
  signers = await ethers.getSigners();
  ({ rDAIContract, rUSDCContract } = await migrate());

  return [
    {
      signers,
      rDAIContract,
      rUSDCContract,
    },
  ];
};

setup().then(tests => {
  describe('DebtToken', async () => {
    tests.forEach(args => {
      debtTokenTests(args);
    });
  });
  run();
});
