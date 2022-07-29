import { expect } from 'chai';
import { ethers } from 'hardhat';
import { utf8ToHex } from '.';
import { DisputesV2Mock } from '../../artifacts/types/DisputesV2Mock';
import { HomeFiProxy } from '../../artifacts/types/HomeFiProxy';
import { getContractAt } from './ethersHelpers';

export const disputesUpgradabilityTests = async ({
  homeFiProxyContract,
  disputesV2MockContract,
}: {
  homeFiProxyContract: HomeFiProxy;
  disputesV2MockContract: DisputesV2Mock;
}) => {
  it('should be able to upgrade homeFi contract to V2', async () => {
    const tx = await homeFiProxyContract.upgradeMultipleImplementations(
      [utf8ToHex('DP')],
      [disputesV2MockContract.address],
    );
    // implementation
    const transparentProxy = await homeFiProxyContract.getLatestAddress(
      utf8ToHex('DP'),
    );
    const proxyAdmin = await homeFiProxyContract.proxyAdmin();
    const ProxyAdminContractFactory = await ethers.getContractFactory(
      'ProxyAdmin',
    );
    const proxyAdminContract = ProxyAdminContractFactory.attach(proxyAdmin);
    expect(
      await proxyAdminContract.getProxyImplementation(transparentProxy),
    ).to.equal(disputesV2MockContract.address);
    disputesV2MockContract = await getContractAt<DisputesV2Mock>(
      'DisputesV2Mock',
      transparentProxy,
    );
  });

  it('should be able to retrieve new state variable', async () => {
    expect(await disputesV2MockContract.newVariable()).to.equal(false);
  });

  it('should be able to call newly added functions', async () => {
    const tx = await disputesV2MockContract.setNewVariable();
    expect(await disputesV2MockContract.newVariable()).to.equal(true);
  });
};
