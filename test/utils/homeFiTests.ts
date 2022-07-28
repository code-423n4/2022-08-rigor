import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { HomeFi } from '../../artifacts/types/HomeFi';
import { Community } from '../../artifacts/types/Community';
import { ProjectFactory } from '../../artifacts/types/ProjectFactory';
import { Disputes } from '../../artifacts/types/Disputes';
import { MockContract } from 'ethereum-waffle';
import { DebtToken } from '../../artifacts/types/DebtToken';

export const homeFiTests = async ({
  signers,
  mockETHContract,
  mockDAIContract,
  mockUSDCContract,
  homeFiContract,
  communityContract,
  disputesContract,
  rETHContract,
  rDAIContract,
  rUSDCContract,
  treasury,
  projectFactoryContract,
}: {
  signers: SignerWithAddress[];
  mockETHContract: MockContract;
  mockDAIContract: MockContract;
  mockUSDCContract: MockContract;
  homeFiContract: HomeFi;
  communityContract: Community;
  disputesContract: Disputes;
  rETHContract: DebtToken;
  rDAIContract: DebtToken;
  rUSDCContract: DebtToken;
  treasury: string;
  projectFactoryContract: ProjectFactory;
}) => {
  it('should be able to set addresses', async () => {
    const tx = await homeFiContract.setAddr(
      projectFactoryContract.address,
      communityContract.address,
      disputesContract.address,
      rDAIContract.address,
      rUSDCContract.address,
      rETHContract.address,
    );
    await expect(tx).to.emit(homeFiContract, 'AddressSet').withArgs();

    expect(await homeFiContract.projectFactoryInstance()).to.equal(
      projectFactoryContract.address,
    );
    expect(await homeFiContract.disputeContract()).to.equal(
      disputesContract.address,
    );
    expect(await homeFiContract.communityContract()).to.equal(
      communityContract.address,
    );
    expect(await homeFiContract.wrappedToken(mockETHContract.address)).to.equal(
      rETHContract.address,
    );
    expect(await homeFiContract.wrappedToken(mockDAIContract.address)).to.equal(
      rDAIContract.address,
    );
    expect(
      await homeFiContract.wrappedToken(mockUSDCContract.address),
    ).to.equal(rUSDCContract.address);
    expect(await homeFiContract.addrSet()).to.equal(true);
  });

  it('should revert setting address again', async () => {
    const tx = homeFiContract.setAddr(
      projectFactoryContract.address,
      communityContract.address,
      disputesContract.address,
      rDAIContract.address,
      rUSDCContract.address,
      rETHContract.address,
    );
    await expect(tx).to.be.revertedWith('HomeFi::Set');
  });

  it('should revert when currency is invalid', async () => {
    const tx = homeFiContract.validCurrency(signers[0].address);
    await expect(tx).to.be.revertedWith('HomeFi::!Currency');
  });

  it('should not revert when currency is valid', async () => {
    await homeFiContract.validCurrency(mockDAIContract.address);
    await homeFiContract.validCurrency(mockETHContract.address);
    await homeFiContract.validCurrency(mockUSDCContract.address);
  });

  it('should revert admin change when sender is not admin', async () => {
    const tx = homeFiContract
      .connect(signers[1])
      .replaceAdmin(signers[1].address);
    await expect(tx).to.be.revertedWith('HomeFi::!Admin');
  });

  it('should revert admin change when new admin is 0 address', async () => {
    const tx = homeFiContract.replaceAdmin(ethers.constants.AddressZero);
    await expect(tx).to.be.revertedWith('HomeFi::0 address');
  });

  it('should revert admin change when new admin is same as old admin', async () => {
    const tx = homeFiContract.replaceAdmin(signers[0].address);
    await expect(tx).to.be.revertedWith('HomeFi::!Change');
  });

  it('should be able to replace admin', async () => {
    const tx = await homeFiContract.replaceAdmin(signers[1].address);
    await expect(tx)
      .to.emit(homeFiContract, 'AdminReplaced')
      .withArgs(signers[1].address);
    expect(await homeFiContract.admin()).to.equal(signers[1].address);
  });

  it('should revert treasury change when sender is not admin', async () => {
    const tx = homeFiContract
      .connect(signers[2])
      .replaceTreasury(signers[1].address);
    await expect(tx).to.be.revertedWith('HomeFi::!Admin');
  });

  it('should revert treasury change when new treasury is 0 address', async () => {
    const tx = homeFiContract
      .connect(signers[1])
      .replaceTreasury(ethers.constants.AddressZero);
    await expect(tx).to.be.revertedWith('HomeFi::0 address');
  });

  it('should revert treasury change when new treasury is same as old treasury', async () => {
    const tx = homeFiContract.connect(signers[1]).replaceTreasury(treasury);
    await expect(tx).to.be.revertedWith('HomeFi::!Change');
  });

  it('should be able to replace treasury', async () => {
    const tx = await homeFiContract
      .connect(signers[1])
      .replaceTreasury(signers[1].address);
    await expect(tx)
      .to.emit(homeFiContract, 'TreasuryReplaced')
      .withArgs(signers[1].address);
    expect(await homeFiContract.treasury()).to.equal(signers[1].address);
  });

  it('should revert investor fee change when sender is not admin', async () => {
    const tx = homeFiContract.connect(signers[2]).replaceLenderFee(2);
    await expect(tx).to.be.revertedWith('HomeFi::!Admin');
  });

  it('should be able to do investor fee change', async () => {
    const tx = await homeFiContract.connect(signers[1]).replaceLenderFee(3);
    await expect(tx).to.emit(homeFiContract, 'LenderFeeReplaced').withArgs(3);
    expect(await homeFiContract.lenderFee()).to.equal(3);
  });

  it('should revert investor fee change when new investor fee is same as old', async () => {
    const tx = homeFiContract.connect(signers[1]).replaceLenderFee(3);
    await expect(tx).to.be.revertedWith('HomeFi::!Change');
  });

  it('changes back to normal', async () => {
    // make signer[0] back as admin
    let tx = await homeFiContract
      .connect(signers[1])
      .replaceAdmin(signers[0].address);
    // treasury
    tx = await homeFiContract.replaceTreasury(treasury);
    // investor fee
    tx = await homeFiContract.replaceLenderFee(2);
  });
};
