import { task } from 'hardhat/config';

// not importing this due to some error
export function utf8ToHex(str: string): string {
  return (
    '0x' +
    Array.from(str)
      .map(c =>
        c.charCodeAt(0) < 128
          ? c.charCodeAt(0).toString(16)
          : encodeURIComponent(c).replace(/\%/g, '').toLowerCase(),
      )
      .join('')
  );
}

task(
  'deployUpgradeGnosis',
  'Send Upgrade transaction to Safe Transaction Service',
)
  .addParam('homeFiProxyAddress', 'homeFiProxy contract address')
  .addParam('proxyBytes2Name', 'bytes2 name of proxy to upgrade')
  .addParam('newImplementationName', "new implementation's contract factory")
  .addParam('gnosisSafeAddress', 'address of the gnosis safe')
  .addParam('safeServiceClient', 'gnosis safe service client url')
  .addOptionalParam('taskLibraryAddress', 'address for task library')
  .setAction(
    async (
      {
        homeFiProxyAddress,
        proxyBytes2Name,
        newImplementationName,
        gnosisSafeAddress,
        safeServiceClient,
      },
      { ethers, run },
    ) => {
      const [deployer] = await ethers.getSigners();
      if (!deployer.provider) {
        process.exit(1);
      }
      const { chainId } = await deployer.provider.getNetwork();
      if (chainId === 31337) {
        await run('test');
      }
      const HomeFiProxyContractFactory = await ethers.getContractFactory(
        'HomeFiProxy',
      );
      const ProxyAdminContractFactory = await ethers.getContractFactory(
        'ProxyAdmin',
      );
      const homeFiProxyContract =
        HomeFiProxyContractFactory.attach(homeFiProxyAddress);
      const homeFiOwner = await homeFiProxyContract.owner();
      if (homeFiOwner !== gnosisSafeAddress) {
        throw new Error('Deployer is not owner of HomeFiProxy');
      }
      const proxyToUpgrade = await homeFiProxyContract.getLatestAddress(
        utf8ToHex(proxyBytes2Name),
      );
      console.log(`Proxy to upgrade address: ${proxyToUpgrade}`);
      const proxyAdminAddress = await homeFiProxyContract.proxyAdmin();
      const proxyAdminContract =
        ProxyAdminContractFactory.attach(proxyAdminAddress);
      const oldImplementation = await proxyAdminContract.getProxyImplementation(
        proxyToUpgrade,
      );
      console.log(`Proxy to upgrade old implementation: ${oldImplementation}`);

      const NewImplementationFactory = await ethers.getContractFactory(
        newImplementationName,
      );
      const newImplementationContract = await NewImplementationFactory.deploy();
      await newImplementationContract.deployed();
      console.log(`New implementation: ${newImplementationContract.address}`);

      const { data } =
        await homeFiProxyContract.populateTransaction.upgradeMultipleImplementations(
          [utf8ToHex(proxyBytes2Name)],
          [newImplementationContract.address],
        );

      await run('gnosisCreateTransaction', {
        gnosisSafeAddress,
        txTo: homeFiProxyAddress,
        txValue: '0',
        txData: data,
        safeServiceClient,
      });

      try {
        await new Promise(res => setTimeout(res, 60 * 1000)); // waiting 60s. Should be enough
        await run('verify', {
          address: newImplementationContract.address,
          constructorArguments: [],
        });
      } catch (e) {
        console.log(`Error in verification:`, e);
      }
    },
  );
