import { ethers, run } from 'hardhat';

const HOMEFI_PROXY_ADDRESS: string = 'XXXX'; // replace with HomeFiProxy address
const PROXY_BYTES2_NAME: 'HF' | 'CN' | 'DP' | 'PF' | 'DA' | 'US' | 'NT' = 'CN';
const NEW_IMPLEMENTATION_NAME: string = 'CommunityV3';
// const TASK_LIBRARY_ADDRESS: string | undefined = undefined;
// const PROJECT_NEW_IMPLEMENTATION_NAME: string | undefined = undefined;
const GNOSIS_SAFE_ADDRESS: string | undefined = undefined;
const SAFE_SERVICE_CLIENT: string | undefined = undefined;

async function upgrade() {
  const [deployer] = await ethers.getSigners();
  if (!deployer.provider) {
    process.exit(1);
  }
  const deployUpgradeObject: {
    homeFiProxyAddress: string;
    proxyBytes2Name: string;
    newImplementationName: string;
    gnosisSafeAddress?: string;
    safeServiceClient?: string;
    taskLibraryAddress?: string;
    projectNewImplementationName?: string;
  } = {
    homeFiProxyAddress: HOMEFI_PROXY_ADDRESS,
    proxyBytes2Name: PROXY_BYTES2_NAME,
    newImplementationName: NEW_IMPLEMENTATION_NAME,
    gnosisSafeAddress: GNOSIS_SAFE_ADDRESS,
    safeServiceClient: SAFE_SERVICE_CLIENT,
  };
  if (GNOSIS_SAFE_ADDRESS && SAFE_SERVICE_CLIENT) {
    await run('deployUpgradeGnosis', deployUpgradeObject);
    console.log(
      'Upgrade transaction sent to Gnosis\nPlease execute the transaction on Gnosis Dashboard',
    );
  } else {
    await run('deployUpgrade', deployUpgradeObject);
    console.log('Upgrade complete');
  }
}

upgrade()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
