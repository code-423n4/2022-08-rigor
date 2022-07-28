import { ethers } from 'hardhat';
import { deployMockToken, utf8ToHex } from './utils';
import { HomeFi } from '../artifacts/types/HomeFi';
import { HomeFiProxy } from '../artifacts/types/HomeFiProxy';
import { Community } from '../artifacts/types/Community';
import { ProjectFactory } from '../artifacts/types/ProjectFactory';
import { Project } from '../artifacts/types/Project';
import { Disputes } from '../artifacts/types/Disputes';
import { MinimalForwarder } from '../artifacts/types/MinimalForwarder';
import { homeFiTests } from './utils/homeFiTests';
import { MockContract } from 'ethereum-waffle';
import { DebtToken } from '../artifacts/types/DebtToken';

const setup = async () => {
  let signers = await ethers.getSigners();
  let address = <string>signers[0].address;
  let tasksLibrary: any;
  let mockETHContract: MockContract;
  let mockDAIContract: MockContract;
  let mockUSDCContract: MockContract;
  let homeFiContract: HomeFi;
  let communityContract: Community;
  let disputesContract: Disputes;
  let rETHContract: DebtToken;
  let rDAIContract: DebtToken;
  let rUSDCContract: DebtToken;
  let treasury: string;
  let lenderFee: number;
  let tokens: any;
  let projectImplementationContract: Project;
  let projectFactoryContract: ProjectFactory;
  let forwarder: MinimalForwarder;
  const MinimalForwarderContractFactory = await ethers.getContractFactory(
    'MinimalForwarder',
  );
  forwarder =
    (await MinimalForwarderContractFactory.deploy()) as MinimalForwarder;
  await forwarder.deployed();

  const TasksContractFactory = await ethers.getContractFactory('Tasks');
  tasksLibrary = await TasksContractFactory.deploy();
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
  mockETHContract = await deployMockToken(signers[0], 'ETH', 'ETH', 18);
  mockDAIContract = await deployMockToken(signers[0], 'DAI', 'DAI', 18);
  mockUSDCContract = await deployMockToken(signers[0], 'USDC', 'USDC', 6);

  const homeFiContractImplementation =
    (await HomeFiContractFactory.deploy()) as HomeFi;
  await homeFiContractImplementation.deployed();

  const communityContractImplementation =
    (await CommunityContractFactory.deploy()) as Community;
  await communityContractImplementation.deployed();

  const disputesContractImplementation =
    (await DisputesContractFactory.deploy()) as Disputes;
  await disputesContractImplementation.deployed();

  const rETHContractImplementation =
    (await DebtTokenContractFactory.deploy()) as DebtToken;
  await rETHContractImplementation.deployed();

  const rDAIContractImplementation =
    (await DebtTokenContractFactory.deploy()) as DebtToken;
  await rDAIContractImplementation.deployed();

  const rUSDCContractImplementation =
    (await DebtTokenContractFactory.deploy()) as DebtToken;
  await rUSDCContractImplementation.deployed();

  const homeFiProxyContract =
    (await HomeFiProxyContractFactory.deploy()) as HomeFiProxy;
  await homeFiProxyContract.deployed();

  const projectFactoryImplementation =
    (await ProjectFactoryContractFactory.deploy()) as ProjectFactory;
  await projectFactoryImplementation.deployed();

  const implementations = [
    homeFiContractImplementation.address,
    communityContractImplementation.address,
    disputesContractImplementation.address,
    projectFactoryImplementation.address,
    rDAIContractImplementation.address,
    rUSDCContractImplementation.address,
    rETHContractImplementation.address,
  ];

  await (await homeFiProxyContract.initiateHomeFi(implementations)).wait();

  homeFiContract = HomeFiContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('HF')),
  ) as HomeFi;
  communityContract = CommunityContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('CN')),
  ) as Community;
  disputesContract = DisputesContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('DP')),
  ) as Disputes;
  projectFactoryContract = ProjectFactoryContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('PF')),
  ) as ProjectFactory;
  rETHContract = DebtTokenContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('DA')),
  ) as DebtToken;
  rDAIContract = DebtTokenContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('US')),
  ) as DebtToken;
  rUSDCContract = DebtTokenContractFactory.attach(
    await homeFiProxyContract.getLatestAddress(utf8ToHex('NT')),
  ) as DebtToken;

  treasury = address;
  lenderFee = 20;
  tokens = {
    eth: ['HomeFi Ether', 'NT', 18],
    dai: ['HomeFi DAI', 'DA', 18],
    usdc: ['HomeFi USDC', 'US', 6],
  };
  await (
    await homeFiContract.initialize(
      treasury,
      lenderFee,
      mockDAIContract.address,
      mockUSDCContract.address,
      mockETHContract.address,
      forwarder.address,
    )
  ).wait();
  await (await communityContract.initialize(homeFiContract.address)).wait();
  await (await disputesContract.initialize(homeFiContract.address)).wait();
  await (
    await rETHContract.initialize(
      communityContract.address,
      tokens.eth[0],
      tokens.eth[1],
      tokens.eth[2],
    )
  ).wait();
  await (
    await rDAIContract.initialize(
      communityContract.address,
      tokens.dai[0],
      tokens.dai[1],
      tokens.dai[2],
    )
  ).wait();
  await (
    await rUSDCContract.initialize(
      communityContract.address,
      tokens.usdc[0],
      tokens.usdc[1],
      tokens.usdc[2],
    )
  ).wait();

  const ProjectContractFactory = await ethers.getContractFactory('Project', {
    libraries: {
      Tasks: tasksLibrary.address,
    },
  });
  projectImplementationContract =
    (await ProjectContractFactory.deploy()) as Project;
  await projectImplementationContract.deployed();

  await (
    await projectFactoryContract.initialize(
      projectImplementationContract.address,
      homeFiContract.address,
    )
  ).wait();
  return [
    {
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
    },
  ];
};
setup().then(tests => {
  describe('HomeFi', async () => {
    tests.forEach(args => {
      homeFiTests(args);
    });
  });
  run();
});
