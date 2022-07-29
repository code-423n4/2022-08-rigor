import { expect } from 'chai';
import { ethers } from 'hardhat';
import { utf8ToHex } from '.';
import { CommunityV2Mock } from '../../artifacts/types/CommunityV2Mock';
import { HomeFiProxy } from '../../artifacts/types/HomeFiProxy';
import { getContractAt } from './ethersHelpers';

export const communityUpgradabilityTests = async ({
  homeFiProxyContract,
  communityV2MockContract,
}: {
  homeFiProxyContract: HomeFiProxy;
  communityV2MockContract: CommunityV2Mock;
}) => {
  it('should be able to upgrade homeFi contract to V2', async () => {
    const proxyAdmin = await homeFiProxyContract.proxyAdmin();
    const ProxyAdminContractFactory = await ethers.getContractFactory(
      'ProxyAdmin',
    );
    const proxyAdminContract = ProxyAdminContractFactory.attach(proxyAdmin);

    let communityProxyAddress = await homeFiProxyContract.getLatestAddress(
      utf8ToHex('CN'),
    );
    let pimpl = await proxyAdminContract.getProxyImplementation(
      communityProxyAddress,
    );
    const tx = await homeFiProxyContract.upgradeMultipleImplementations(
      [utf8ToHex('CN')],
      [communityV2MockContract.address],
    );
    // implementation
    const transparentProxy = await homeFiProxyContract.getLatestAddress(
      utf8ToHex('CN'),
    );
    expect(
      await proxyAdminContract.getProxyImplementation(transparentProxy),
    ).to.equal(communityV2MockContract.address);
    communityV2MockContract = await getContractAt<CommunityV2Mock>(
      'CommunityV2Mock',
      transparentProxy,
    );
  });

  it('should be able to retrieve new state variable', async () => {
    expect(await communityV2MockContract.newVariable()).to.equal(false);
  });

  it('should be able to call newly added functions', async () => {
    const tx = await communityV2MockContract.setNewVariable();
    expect(await communityV2MockContract.newVariable()).to.equal(true);
  });
};
