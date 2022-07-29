import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { HomeFiProxy } from '../../artifacts/types/HomeFiProxy';
import { HomeFi } from '../../artifacts/types/HomeFi';
import { HomeFiV2Mock } from '../../artifacts/types/HomeFiV2Mock';
import { HomeFiV3Mock } from '../../artifacts/types/HomeFiV3Mock';
import { utf8ToHex } from '.';
import { MinimalForwarder } from '../../artifacts/types/MinimalForwarder';
import { Disputes } from '../../artifacts/types/Disputes';
import { ProjectFactory } from '../../artifacts/types/ProjectFactory';
import { Community } from '../../artifacts/types/Community';
import { getContractAt } from './ethersHelpers';
import { MockContract } from 'ethereum-waffle';

export const homeFiUpgradabilityTests = async ({
  signers,
  homeFiProxyContract,
  homeFiContract,
  homeFiV2MockContract,
  homeFiV3MockContract,
  treasury,
  lenderFee,
  communityContract,
  disputesContract,
  projectFactoryContract,
  forwarder,
  mockETHContract,
  mockDAIContract,
  mockUSDCContract,
}: {
  signers: SignerWithAddress[];
  homeFiProxyContract: HomeFiProxy;
  homeFiContract: HomeFi;
  homeFiV2MockContract: HomeFiV2Mock;
  homeFiV3MockContract: HomeFiV3Mock;
  treasury: string;
  lenderFee: number;
  communityContract: Community;
  disputesContract: Disputes;
  projectFactoryContract: ProjectFactory;
  forwarder: MinimalForwarder;
  mockETHContract: MockContract;
  mockDAIContract: MockContract;
  mockUSDCContract: MockContract;
}) => {
  it('should be able to upgrade homeFi contract to V2', async () => {
    const tx = await homeFiProxyContract.upgradeMultipleImplementations(
      [utf8ToHex('HF')],
      [homeFiV2MockContract.address],
    );
    // implementation
    const transparentProxy = await homeFiProxyContract.getLatestAddress(
      utf8ToHex('HF'),
    );
    const proxyAdmin = await homeFiProxyContract.proxyAdmin();
    const ProxyAdminContractFactory = await ethers.getContractFactory(
      'ProxyAdmin',
    );
    const proxyAdminContract = ProxyAdminContractFactory.attach(proxyAdmin);
    expect(
      await proxyAdminContract.getProxyImplementation(transparentProxy),
    ).to.equal(homeFiV2MockContract.address);
    homeFiV2MockContract = await getContractAt<HomeFiV2Mock>(
      'HomeFiV2Mock',
      homeFiContract.address,
    ); //proxy address
  });

  it('should be able to retrieve old implementation data', async () => {
    expect(await homeFiV2MockContract.admin()).to.equal(signers[0].address);
    expect(await homeFiV2MockContract.treasury()).to.equal(signers[0].address);
    expect(await homeFiV2MockContract.lenderFee()).to.equal(lenderFee);
    expect(await homeFiV2MockContract.treasury()).to.equal(treasury);
    expect(await homeFiV2MockContract.tokenCurrency1()).to.equal(
      mockDAIContract.address,
    );
    expect(await homeFiV2MockContract.tokenCurrency2()).to.equal(
      mockUSDCContract.address,
    );
    expect(await homeFiV2MockContract.tokenCurrency3()).to.equal(
      mockETHContract.address,
    );
    expect(await homeFiV2MockContract.trustedForwarder()).to.equal(
      forwarder.address,
    );
    expect(await homeFiV2MockContract.projectFactoryInstance()).to.equal(
      projectFactoryContract.address,
    );
    expect(await homeFiV2MockContract.communityContract()).to.equal(
      communityContract.address,
    );
    expect(await homeFiV2MockContract.disputesContract()).to.equal(
      disputesContract.address,
    );
    expect(await homeFiV2MockContract.addrSet()).to.equal(true);
  });

  it('should be able to retrieve new state variable', async () => {
    expect(await homeFiV2MockContract.addrSet2()).to.equal(false);
    expect(await homeFiV2MockContract.counter()).to.equal(0);
  });

  it('should be able to call newly added functions', async () => {
    let tx = await homeFiV2MockContract.setAddrFalse();
    expect(await homeFiV2MockContract.addrSet()).to.equal(false);
    expect(await homeFiV2MockContract.addrSet2()).to.equal(true);

    tx = await homeFiV2MockContract.incrementCounter();
    expect(await homeFiV2MockContract.counter()).to.equal(1);
  });

  it('should be able to call overridden functions', async () => {
    let tx = await homeFiV2MockContract.setTrustedForwarder(signers[0].address);
    await expect(tx)
      .to.emit(homeFiV2MockContract, 'TrustedForwarderChanged')
      .withArgs(signers[0].address);
    expect(await homeFiV2MockContract.trustedForwarder()).to.equal(
      signers[0].address,
    );
  });

  it('should be able to upgrade homeFi contract to V3', async () => {
    const tx = await homeFiProxyContract.upgradeMultipleImplementations(
      [utf8ToHex('HF')],
      [homeFiV3MockContract.address],
    );
    // implementation
    const transparentProxy = await homeFiProxyContract.getLatestAddress(
      utf8ToHex('HF'),
    );
    const proxyAdmin = await homeFiProxyContract.proxyAdmin();
    const ProxyAdminContractFactory = await ethers.getContractFactory(
      'ProxyAdmin',
    );
    const proxyAdminContract = ProxyAdminContractFactory.attach(proxyAdmin);
    expect(
      await proxyAdminContract.getProxyImplementation(transparentProxy),
    ).to.equal(homeFiV3MockContract.address);
    homeFiV3MockContract = await getContractAt<HomeFiV3Mock>(
      'HomeFiV3Mock',
      homeFiContract.address,
    ); //proxy address
    expect(await homeFiV3MockContract.newVariable()).to.equal(0);
  });

  it('should be able to call overridden functions', async () => {
    let tx = await homeFiV2MockContract
      .connect(signers[1])
      .setTrustedForwarder(forwarder.address);
    await expect(tx)
      .to.emit(homeFiV3MockContract, 'TrustedForwarderChangedWithSender')
      .withArgs(forwarder.address, signers[1].address);
    expect(await homeFiV2MockContract.trustedForwarder()).to.equal(
      forwarder.address,
    );
  });
};
