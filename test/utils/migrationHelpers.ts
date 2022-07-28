import { ethers } from 'hardhat';
// import {deployMockContract} from 'waffle/mock-contract';
import { HomeFi } from '../../artifacts/types/HomeFi';
import { HomeFiProxy } from '../../artifacts/types/HomeFiProxy';
import { Community } from '../../artifacts/types/Community';
import { ProjectFactory } from '../../artifacts/types/ProjectFactory';
import { Project } from '../../artifacts/types/Project';
import { Disputes } from '../../artifacts/types/Disputes';
import { MinimalForwarder } from '../../artifacts/types/MinimalForwarder';
import * as ERC20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import { deploy, getContractAt } from './ethersHelpers';
import { DebtToken } from '../../artifacts/types/DebtToken';
import { waffle } from 'hardhat';
import { MockContract } from 'ethereum-waffle';

const { deployMockContract } = waffle;

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

export async function deployMockToken(
  signer: any,
  symbol: string,
  name: string,
  decimals: number,
): Promise<MockContract> {
  const mockTokenContract = await deployMockContract(signer, ERC20.abi);
  await mockTokenContract.mock.name.withArgs().returns(name);
  await mockTokenContract.mock.decimals.withArgs().returns(decimals);
  return mockTokenContract;
}

/**
 * Deploy a new suite of contracts, for migrations or cleanroom tests
 *
 * @return homeFiContract - main HomeFi ERC721/ Admin Entrypoint
 * @return projectFactoryContract - contract owned by homeFi that deploys project contracts
 * @return tasksLibrary - contract containing task library
 * @return communityContract - contract where external lending flows into projects
 * @return disputeContract - contract where disputes over project actions are abitrated by admin
 * @return rETHContract - HomeFi ETH-Collateralized Debt Obligation ERC20
 * @return rDAIContract - HomeFi DAI-Collateralized Debt Obligation ERC20
 * @return rUSDCContract - HomeFi USDC-Collateralized Debt Obligation ERC20
 * @return mockETHContract - TO BE REMOVED
 * @return mockDAIContract - Mock of On-Chain DAI ERC20
 * @return mockUSDCContract - Mock of On-Chain USDC ERC20
 * @return treasury - Address of the beneficiary of operating HomeFI
 * @return lenderFee - Predefined lender fee (can be changed) of 2%
 */
export async function migrate() {
  const signers = await ethers.getSigners();
  const address = signers[0].address;

  const TasksContractFactory = await ethers.getContractFactory('Tasks');
  const tasksLibrary = await TasksContractFactory.deploy();
  await tasksLibrary.deployed();

  const forwarder = await deploy<MinimalForwarder>('MinimalForwarder');
  const homeFiContractImplementation = await deploy<HomeFi>('HomeFi');
  const communityContractImplementation = await deploy<Community>('Community');
  const disputesContractImplementation = await deploy<Disputes>('Disputes');
  const rDAIContractImplementation = await deploy<DebtToken>('DebtToken');
  const rUSDCContractImplementation = await deploy<DebtToken>('DebtToken');
  const rETHContractImplementation = await deploy<DebtToken>('DebtToken');

  const homeFiProxyContract = await deploy<HomeFiProxy>('HomeFiProxy');

  const projectFactoryImplementation = await deploy<ProjectFactory>(
    'ProjectFactory',
  );

  const mockDAIContract = await deployMockToken(signers[0], 'DAI', 'DAI', 18);
  const mockUSDCContract = await deployMockToken(signers[0], 'USDC', 'USDC', 6);
  const mockETHContract = await deployMockToken(signers[0], 'ETH', 'ETH', 18);
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
  const homeFiContract = await getContractAt<HomeFi>(
    'HomeFi',
    await homeFiProxyContract.getLatestAddress(utf8ToHex('HF')),
  );
  const projectFactoryContract = await getContractAt<ProjectFactory>(
    'ProjectFactory',
    await homeFiProxyContract.getLatestAddress(utf8ToHex('PF')),
  );
  const communityContract = await getContractAt<Community>(
    'Community',
    await homeFiProxyContract.getLatestAddress(utf8ToHex('CN')),
  );
  const disputesContract = await getContractAt<Disputes>(
    'Disputes',
    await homeFiProxyContract.getLatestAddress(utf8ToHex('DP')),
  );
  const rETHContract = await getContractAt<DebtToken>(
    'DebtToken',
    await homeFiProxyContract.getLatestAddress(utf8ToHex('NT')),
  );
  const rDAIContract = await getContractAt<DebtToken>(
    'DebtToken',
    await homeFiProxyContract.getLatestAddress(utf8ToHex('DA')),
  );
  const rUSDCContract = await getContractAt<DebtToken>(
    'DebtToken',
    await homeFiProxyContract.getLatestAddress(utf8ToHex('US')),
  );

  const treasury = address;
  const lenderFee = 20;
  const tokens = {
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
      tokens.eth[0] as string,
      tokens.eth[1] as string,
      tokens.eth[2],
    )
  ).wait();
  await (
    await rDAIContract.initialize(
      communityContract.address,
      tokens.dai[0] as string,
      tokens.dai[1] as string,
      tokens.dai[2],
    )
  ).wait();
  await (
    await rUSDCContract.initialize(
      communityContract.address,
      tokens.usdc[0] as string,
      tokens.usdc[1] as string,
      tokens.usdc[2],
    )
  ).wait();

  const projectImplementationContract = await deploy<Project>('Project', {
    Tasks: tasksLibrary.address,
  });

  await (
    await projectFactoryContract.initialize(
      projectImplementationContract.address,
      homeFiContract.address,
    )
  ).wait();

  const setAddressTx = await homeFiContract.setAddr(
    projectFactoryContract.address,
    communityContract.address,
    disputesContract.address,
    rDAIContract.address,
    rUSDCContract.address,
    rETHContract.address,
  );
  await setAddressTx.wait();
  return {
    projectImplementationContract,
    homeFiProxyContract,
    homeFiContract,
    projectFactoryContract,
    tasksLibrary,
    communityContract,
    disputesContract,
    rETHContract,
    rDAIContract,
    rUSDCContract,
    mockETHContract,
    mockDAIContract,
    mockUSDCContract,
    treasury,
    lenderFee,
    forwarder,
  };
}
