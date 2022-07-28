import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deploy } from './ethersHelpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DebtToken } from '../../artifacts/types/DebtToken';

export const debtTokenTests = async ({
  signers,
  rDAIContract,
  rUSDCContract,
}: {
  signers: SignerWithAddress[];
  rDAIContract: DebtToken;
  rUSDCContract: DebtToken;
}) => {
  it('should revert when initialize with zero address', async () => {
    const deptTokenImplementation = await deploy<DebtToken>('DebtToken');
    await deptTokenImplementation.deployed();
    const tx = deptTokenImplementation.initialize(
      ethers.constants.AddressZero,
      'dummyName',
      'DN',
      18,
    );
    await expect(tx).to.be.revertedWith('DebtToken::0 address');
  });

  it('should return correct decimals', async () => {
    expect(await rDAIContract.decimals()).to.equal(18);
    expect(await rUSDCContract.decimals()).to.equal(6);
  });

  it('should revert to call transfer function', async () => {
    await expect(
      rDAIContract.transfer(signers[1].address, 1e10),
    ).to.be.revertedWith('DebtToken::blocked');
    await expect(
      rDAIContract.transferFrom(signers[0].address, signers[1].address, 1e10),
    ).to.be.revertedWith('DebtToken::blocked');
  });

  it('should revert call to mint and burn when not community', async () => {
    await expect(
      rDAIContract.mint(signers[0].address, 1e10),
    ).to.be.revertedWith('DebtToken::!CommunityContract');
    await expect(
      rDAIContract.burn(signers[0].address, 1e10),
    ).to.be.revertedWith('DebtToken::!CommunityContract');
  });
};
