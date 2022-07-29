import { expect } from 'chai';
import { ethers } from 'hardhat';
import { utf8ToHex } from '.';
import { DebtTokenV2Mock } from '../../artifacts/types/DebtTokenV2Mock';
import { HomeFiProxy } from '../../artifacts/types/HomeFiProxy';
import { getContractAt } from './ethersHelpers';

export const debtTokenUpgradabilityTests = async ({
  homeFiProxyContract,
  debtTokenV2MockContract,
}: {
  homeFiProxyContract: HomeFiProxy;
  debtTokenV2MockContract: DebtTokenV2Mock;
}) => {
  it('should be able to upgrade homeFi contract to V2', async () => {
    const tx = await homeFiProxyContract.upgradeMultipleImplementations(
      [utf8ToHex('DA')],
      [debtTokenV2MockContract.address],
    );
    // implementation
    const transparentProxy = await homeFiProxyContract.getLatestAddress(
      utf8ToHex('DA'),
    );
    const proxyAdmin = await homeFiProxyContract.proxyAdmin();
    const ProxyAdminContractFactory = await ethers.getContractFactory(
      'ProxyAdmin',
    );
    const proxyAdminContract = ProxyAdminContractFactory.attach(proxyAdmin);
    expect(
      await proxyAdminContract.getProxyImplementation(transparentProxy),
    ).to.equal(debtTokenV2MockContract.address);
    debtTokenV2MockContract = await getContractAt<DebtTokenV2Mock>(
      'DebtTokenV2Mock',
      transparentProxy,
    );
  });

  it('should be able to retrieve new state variable', async () => {
    expect(await debtTokenV2MockContract.newVariable()).to.equal(false);
  });

  it('should be able to call newly added functions', async () => {
    const tx = await debtTokenV2MockContract.setNewVariable();
    expect(await debtTokenV2MockContract.newVariable()).to.equal(true);
  });
};
