import { network, run, ethers } from 'hardhat';
import { utf8ToHex } from '../test/utils';
import fs from 'fs';
import { HomeFi } from '../artifacts/types/HomeFi';
import { Community } from '../artifacts/types/Community';
import { Disputes } from '../artifacts/types/Disputes';
import { ProjectFactory } from '../artifacts/types/ProjectFactory';
import { DebtToken } from '../artifacts/types/DebtToken';

const ETHERSCAN_CHAIN_IDS = [1, 3, 4, 5, 42];
const BLOCKSCOUT_CHAIN_IDS = [77, 100];
const SUPPORTED_NETWORKS = [4, 77, 100, 31337];
const PRODUCTION_NETWORKS = [100];
const DEVELOPMENT_DEPLOYMENT = false;

function printLog(msg: string) {
  if (process.stdout.isTTY) {
    process.stdout.clearLine(-1);
    process.stdout.cursorTo(0);
    process.stdout.write(msg);
  }
}

function gnosisAddress(chainId: number, address: string) {
  switch (chainId.toString()) {
    case '4':
      return '0x3e09c70529248ce630d48dbe7c7b3032ec304448';
    default:
      return address;
  }
}

function currencySymbol(chainId: number) {
  switch (chainId.toString()) {
    case '77':
      return 'SPOA';
    case '100':
      return 'XDAI';
    default:
      return 'ETH';
  }
}

function currencyAddresses(chainId: number) {
  switch (chainId.toString()) {
    // Rinkeby
    case '4':
      return {
        WRAPPED_NATIVE_TOKEN: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
        TOKEN_CURRENCY_1: '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea', // compound DAI
        TOKEN_CURRENCY_2: '0xFC14dB2acDa7f2ff41462692094206247D4AEBF3', // custom USDC
        // TOKEN_CURRENCY_2: '0x4dbcdf9b62e891a7cec5a2568c3f4faf9e8abe2b', // compound USDC
      };
    // Hardhat
    case '31337':
      return {
        WRAPPED_NATIVE_TOKEN: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        TOKEN_CURRENCY_1: '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea',
        TOKEN_CURRENCY_2: '0xFC14dB2acDa7f2ff41462692094206247D4AEBF3',
      };
    default: {
      throw new Error('Un-supported network');
    }
  }
}

function biconomyForwarder(chainId: number) {
  switch (chainId.toString()) {
    // Mainnet
    case '1':
      return '0x84a0856b038eaAd1cC7E297cF34A7e72685A8693';
    // Rinkeby
    case '4':
      return '0xFD4973FeB2031D4409fB57afEE5dF2051b171104';
    // xDai
    case '100': {
      return '0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8';
    }
    // Polygon Mainnet
    case '137': {
      return '0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8';
    }
    // Arbitrum Testnet Rinkeby
    case '421611': {
      return '0x67454E169d613a8e9BA6b06af2D267696EAaAf41';
    }
    // Hardhat
    case '31337':
      return '0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8';
    default: {
      return ethers.constants.AddressZero;
    }
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const address = await deployer.getAddress();
  if (!deployer.provider) {
    process.exit(1);
  }
  const { chainId } = await deployer.provider.getNetwork();

  if (SUPPORTED_NETWORKS.indexOf(chainId) === -1)
    throw new Error('Un-supported network');

  console.log('Deploying HomeFi on network:', network.name);
  console.log('Account address:', address);
  console.log(
    'Account balance:',
    ethers.utils.formatEther(await deployer.provider.getBalance(address)),
    currencySymbol(chainId),
  );
  console.log(`Gnosis Safe Address: ${gnosisAddress(chainId, address)}`);

  printLog('Deploying TasksLibrary...');
  const TasksContractFactory = await ethers.getContractFactory('Tasks');
  const tasksLibrary = await TasksContractFactory.deploy();
  await tasksLibrary.deployed();

  const HomeFiContractFactory = await ethers.getContractFactory('HomeFi');
  const CommunityContractFactory = await ethers.getContractFactory('Community');
  const DisputesContractFactory = await ethers.getContractFactory('Disputes');
  const DebtTokenContractFactory = await ethers.getContractFactory('DebtToken');
  const HomeFiProxyContractFactory = await ethers.getContractFactory(
    'HomeFiProxy',
  );
  const ProjectFactoryContractFactory = await ethers.getContractFactory(
    'ProjectFactory',
  );

  printLog('Deploying HomeFiContract...');
  const homeFiContractImplementation = await HomeFiContractFactory.deploy();
  await homeFiContractImplementation.deployed();

  printLog('Deploying CommunityContract...');
  const communityContractImplementation =
    await CommunityContractFactory.deploy();
  await communityContractImplementation.deployed();

  printLog('Deploying DisputesContract...');
  const disputesContractImplementation = await DisputesContractFactory.deploy();
  await disputesContractImplementation.deployed();

  printLog('Deploying rETHContract...');
  const rETHContractImplementation = await DebtTokenContractFactory.deploy();
  await rETHContractImplementation.deployed();

  printLog('Deploying rDAIContract...');
  const rDAIContractImplementation = await DebtTokenContractFactory.deploy();
  await rDAIContractImplementation.deployed();

  printLog('Deploying rUSDCContract...');
  const rUSDCContractImplementation = await DebtTokenContractFactory.deploy();
  await rUSDCContractImplementation.deployed();

  printLog('Deploying HomeFiProxyContract...');
  const homeFiProxyContract = await HomeFiProxyContractFactory.deploy();
  await homeFiProxyContract.deployed();

  printLog('Deploying ProjectFactoryContract...');
  const projectFactoryContractImplementation =
    await ProjectFactoryContractFactory.deploy();
  await projectFactoryContractImplementation.deployed();

  printLog('Initializing HomeFiProxyContract...');
  const implementations = [
    homeFiContractImplementation.address,
    communityContractImplementation.address,
    disputesContractImplementation.address,
    projectFactoryContractImplementation.address,
    rDAIContractImplementation.address,
    rUSDCContractImplementation.address,
    rETHContractImplementation.address,
  ];

  await (await homeFiProxyContract.initiateHomeFi(implementations)).wait();

  printLog('Initialized HomeFiProxyContract');

  const homeFiContract = HomeFiContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('HF')),
  ) as HomeFi;
  const communityContract = CommunityContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('CN')),
  ) as Community;
  const disputesContract = DisputesContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('DP')),
  ) as Disputes;
  const projectFactoryContract = ProjectFactoryContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('PF')),
  ) as ProjectFactory;
  const rETHContract = DebtTokenContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('NT')),
  ) as DebtToken;
  const rDAIContract = DebtTokenContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('DA')),
  ) as DebtToken;
  const rUSDCContract = DebtTokenContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('US')),
  ) as DebtToken;

  const treasury = gnosisAddress(chainId, address);
  const lenderFee = 5; // 0.5%
  const tokens = {
    eth: ['HomeFi Ether', 'rETH', 18],
    dai: ['HomeFi DAI', 'rDAI', 18],
    usdc: ['HomeFi USDC', 'rUSDC', 6],
  };
  printLog('Initializing HomeFiContract...');
  await (
    await homeFiContract.initialize(
      treasury,
      lenderFee,
      currencyAddresses(chainId).TOKEN_CURRENCY_1,
      currencyAddresses(chainId).TOKEN_CURRENCY_2,
      currencyAddresses(chainId).WRAPPED_NATIVE_TOKEN,
      biconomyForwarder(chainId),
    )
  ).wait();
  printLog('Initializing CommunityContract...');
  await (await communityContract.initialize(homeFiContract.address)).wait();
  printLog('Initializing DisputesContract...');
  await (await disputesContract.initialize(homeFiContract.address)).wait();
  printLog('Initializing rETHContract...');
  await (
    await rETHContract.initialize(
      communityContract.address,
      String(tokens.eth[0]),
      String(tokens.eth[1]),
      tokens.eth[2],
    )
  ).wait();
  printLog('Initializing rDAIContract...');
  await (
    await rDAIContract.initialize(
      communityContract.address,
      String(tokens.dai[0]),
      String(tokens.dai[1]),
      tokens.dai[2],
    )
  ).wait();
  printLog('Initializing rUSDCContract...');
  await (
    await rUSDCContract.initialize(
      communityContract.address,
      String(tokens.usdc[0]),
      String(tokens.usdc[1]),
      tokens.usdc[2],
    )
  ).wait();
  printLog('Initialized rUSDCContract');

  printLog('Deploying ProjectContract...');
  const ProjectContractFactory = await ethers.getContractFactory('Project', {
    libraries: {
      Tasks: tasksLibrary.address,
    },
  });
  const projectImplementationContract = await ProjectContractFactory.deploy();
  await projectImplementationContract.deployed();

  printLog('Initializing Project Factory...');
  await (
    await projectFactoryContract.initialize(
      projectImplementationContract.address,
      homeFiContract.address,
    )
  ).wait();

  printLog('Initializing HomeFiContract...');
  const setAddressTx = await homeFiContract.setAddr(
    projectFactoryContract.address,
    communityContract.address,
    disputesContract.address,
    rDAIContract.address,
    rUSDCContract.address,
    rETHContract.address,
  );
  await setAddressTx.wait();
  if (!PRODUCTION_NETWORKS.includes(chainId)) {
    printLog('Disabling restriction to admin for Communities...');
    const restricted = await communityContract.unrestrictToAdmin();
    await restricted.wait();
  }
  if (gnosisAddress(chainId, address) !== address) {
    printLog('Replacing HomeFiProxy owner with Gnosis Safe...');
    const replaceOwner = await homeFiProxyContract.transferOwnership(
      gnosisAddress(chainId, address),
    );
    await replaceOwner.wait();
    printLog('Replacing admin with Gnosis Safe...');
    const replaceAdminTx = await homeFiContract.replaceAdmin(
      gnosisAddress(chainId, address),
    );
    await replaceAdminTx.wait();
  }
  const receipt = await deployer.provider.getTransactionReceipt(
    setAddressTx.hash,
  );
  printLog(
    `Deployed and Initialized Contracts at Block: ${receipt.blockNumber}\n`,
  );
  console.log(`HomeFi Proxy Contract Address: ${homeFiProxyContract.address}`);
  console.log(`HomeFi ERC721 Contract Address: ${homeFiContract.address}`);
  console.log(
    `Project Factory Contract Address: ${projectFactoryContract.address}`,
  );
  console.log(`Community Contract Address: ${communityContract.address}`);
  console.log(`Disputes Contract Address: ${disputesContract.address}`);
  console.log(`HomeFi Wrapped Ether ERC20 Address: ${rETHContract.address}`);
  console.log(`HomeFi Wrapped Dai ERC20 Address: ${rDAIContract.address}`);
  console.log(`HomeFi Wrapped USDC ERC20 Address: ${rUSDCContract.address}`);
  console.log(`Task Library Address: ${tasksLibrary.address}`);

  const deploymentInfo = {
    network: network.name,
    'HomeFiProxy Contract Address': homeFiProxyContract.address,
    'HomeFi ERC721 Contract Address': homeFiContract.address,
    'Project Factory Contract Address': projectFactoryContract.address,
    'Community Contract Address': communityContract.address,
    'Disputes Contract Address': disputesContract.address,
    'HomeFi Wrapped Ether ERC20 Address': rETHContract.address,
    'HomeFi Wrapped Dai ERC20 Address': rDAIContract.address,
    'HomeFi Wrapped USDC ERC20 Address': rUSDCContract.address,
    'Task Library Address': tasksLibrary.address,
    'Block Number': receipt.blockNumber.toString(),
  };

  fs.writeFileSync(
    `deployments/${network.name}${DEVELOPMENT_DEPLOYMENT ? '-dev' : ''}.json`,
    JSON.stringify(deploymentInfo, undefined, 2),
  );
  console.log(
    `Latest Contract Address written to: deployments/${network.name}.json`,
  );

  const proxyAdminAddress = await homeFiProxyContract.proxyAdmin();

  const isBlockScout = BLOCKSCOUT_CHAIN_IDS.includes(chainId);
  const isEtherscan = ETHERSCAN_CHAIN_IDS.includes(chainId);

  if (isEtherscan || isBlockScout) {
    printLog(
      `Waiting for ${
        isBlockScout ? 'BlockScout' : 'Etherscan'
      } to index Contracts...`,
    );
    await setAddressTx.wait(5);
    printLog('Verifying Contracts...\n');

    const TASK_VERIFY = 'verify:verify';
    const TASK_VERIFY_PROXY = 'verify:verify-proxy';

    // Commented as this is not required.
    // verify TransparentProxy for HomeFi
    // try {
    //   await run(TASK_VERIFY, {
    //     address: homeFiContract.address,
    //     constructorArguments: [
    //       homeFiContractImplementation.address,
    //       proxyAdminAddress,
    //       '0x',
    //     ],
    //   });
    // } catch (error) {
    //   console.error(`Error verifying ${homeFiContract.address}: `, error);
    // }

    // verify Contract Implementation
    const contracts = [
      tasksLibrary.address,
      proxyAdminAddress,
      homeFiProxyContract.address,
      homeFiContractImplementation.address,
      communityContractImplementation.address,
      rDAIContractImplementation.address,
      projectImplementationContract.address,
      projectFactoryContractImplementation.address,
      disputesContractImplementation.address,
    ];
    for (let i = 0; i < contracts.length; ++i) {
      try {
        await run(TASK_VERIFY, {
          address: contracts[i],
          constructorArguments: [],
        });
      } catch (error) {
        console.error(`Error verifying ${contracts[i]}: `, error);
      }
    }

    // verify proxy implementation
    if (!isBlockScout) {
      // not required for BlockScout as it automatically checks for implementation
      const proxies = [
        homeFiContract.address,
        communityContract.address,
        rETHContract.address,
        rDAIContract.address,
        rUSDCContract.address,
        projectFactoryContract.address,
        disputesContract.address,
      ];
      for (let i = 0; i < proxies.length; ++i) {
        try {
          await run(TASK_VERIFY_PROXY, {
            address: proxies[i],
          });
        } catch (error) {
          console.error(`Error verifying ${proxies[i]}: `, error);
        }
      }
    }

    console.log('\nVerified Contracts.');
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
