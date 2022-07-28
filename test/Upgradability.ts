import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { HomeFiProxy } from '../artifacts/types/HomeFiProxy';
import { HomeFi } from '../artifacts/types/HomeFi';
import { HomeFiV2Mock } from '../artifacts/types/HomeFiV2Mock';
import { HomeFiV3Mock } from '../artifacts/types/HomeFiV3Mock';
import {
  createProject,
  communityTests,
  homeFiTests,
  migrate,
  homeFiUpgradabilityTests,
  communityUpgradabilityTests,
  disputesUpgradabilityTests,
  disputeTests,
  debtTokenTests,
  debtTokenUpgradabilityTests,
  projectFactoryUpgradabilityTests,
  projectFactoryTests,
  projectUpgradabilityTests,
  projectTests,
  createProjectWithoutContractor,
} from './utils';
import { MinimalForwarder } from '../artifacts/types/MinimalForwarder';
import { Disputes } from '../artifacts/types/Disputes';
import { ProjectFactory } from '../artifacts/types/ProjectFactory';
import { Community } from '../artifacts/types/Community';
import { ProxyAdmin } from '../artifacts/types/ProxyAdmin';
import { utf8ToHex } from './utils';
import { CommunityV2Mock } from '../artifacts/types/CommunityV2Mock';
import { deploy, getContractAt } from './utils/ethersHelpers';
import { Project } from '../artifacts/types/Project';
import { DisputesV2Mock } from '../artifacts/types/DisputesV2Mock';
import { DebtTokenV2Mock } from '../artifacts/types/DebtTokenV2Mock';
import { ProjectV2Mock } from '../artifacts/types/ProjectV2Mock';
import { MockContract } from 'ethereum-waffle';
import { DebtToken } from '../artifacts/types/DebtToken';

const setupSC = async () => {
  let signers: SignerWithAddress[];
  let homeFiProxyContract: HomeFiProxy;
  let homeFiContract: HomeFi;
  let homeFiV2MockContract: HomeFiV2Mock;
  let homeFiV3MockContract: HomeFiV3Mock;
  let treasury: string;
  let lenderFee: number;
  let communityContract: Community;
  let disputesContract: Disputes;
  let projectFactoryContract: ProjectFactory;
  let forwarder: MinimalForwarder;
  let mockETHContract: MockContract;
  let mockDAIContract: MockContract;
  let mockUSDCContract: MockContract;
  let rETHContract: DebtToken;
  let rDAIContract: DebtToken;
  let rUSDCContract: DebtToken;
  let communityV2MockContract: CommunityV2Mock;

  let disputesV2MockContract: DisputesV2Mock;
  let debtTokenV2MockContract: DebtTokenV2Mock;
  let projectFactoryV2Contract: ProjectFactory;
  let tokenCurrency1: string;
  let nativeCurrency: string;
  let project: any;
  let project2: any;
  let etherProject: any;
  let tasksLibrary: any;
  let exampleHash: string;
  let proxyAdmin: ProxyAdmin;
  let projectImplementationContract: any;
  let project3: Project;
  let project4: Project;
  let etherProject2: Project;

  let ProxyAdminContractFactory = await ethers.getContractFactory('ProxyAdmin');

  signers = await ethers.getSigners();
  ({
    homeFiProxyContract,
    homeFiContract,
    mockETHContract,
    mockDAIContract,
    mockUSDCContract,
    treasury,
    lenderFee,
    communityContract,
    disputesContract,
    projectFactoryContract,
    forwarder,
    rETHContract,
    rDAIContract,
    rUSDCContract,
    tasksLibrary,
    projectImplementationContract,
  } = await migrate());
  // parameters required for various tests
  const proxyAdminAddress = await homeFiProxyContract.proxyAdmin();

  proxyAdmin = await getContractAt<ProxyAdmin>('ProxyAdmin', proxyAdminAddress); //ProxyAdminContractFactory.attach(proxyAdminAddress);
  tokenCurrency1 = await homeFiContract.tokenCurrency1();
  nativeCurrency = await homeFiContract.tokenCurrency3();
  ({ projectContractInstance: project } = await createProject(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  ));
  ({ projectContractInstance: project2 } = await createProject(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  ));
  ({ projectContractInstance: etherProject } = await createProject(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    nativeCurrency,
  ));
  ({ projectContractInstance: project3 } = await createProjectWithoutContractor(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  ));
  ({ projectContractInstance: project4 } = await createProjectWithoutContractor(
    homeFiContract,
    tasksLibrary.address,
    '0x',
    tokenCurrency1,
  ));
  ({ projectContractInstance: etherProject2 } =
    await createProjectWithoutContractor(
      homeFiContract,
      tasksLibrary.address,
      '0x',
      nativeCurrency,
    ));
  exampleHash = '0x1234'; // required for task add - dummy data

  // Upgrades deployment
  homeFiV2MockContract = await deploy<HomeFiV2Mock>('HomeFiV2Mock');
  homeFiV3MockContract = await deploy<HomeFiV3Mock>('HomeFiV3Mock');
  communityV2MockContract = await deploy<CommunityV2Mock>('CommunityV2Mock');
  disputesV2MockContract = await deploy<DisputesV2Mock>('DisputesV2Mock');
  debtTokenV2MockContract = await deploy<DebtTokenV2Mock>('DebtTokenV2Mock');
  projectFactoryV2Contract = await deploy<ProjectFactory>('ProjectFactory');

  return {
    ProxyAdminContractFactory,
    proxyAdmin,
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
    rETHContract,
    rDAIContract,
    rUSDCContract,
    communityV2MockContract,
    disputesV2MockContract,
    debtTokenV2MockContract,
    projectFactoryV2Contract,
    tokenCurrency1,
    nativeCurrency,
    project,
    project2,
    etherProject,
    tasksLibrary,
    exampleHash,
    projectImplementationContract,
    project3,
    project4,
    etherProject2,
  };
};
const setup = async () => {
  const scForUpgradability = await setupSC();
  const scForRegression = await setupSC();
  // change implementation of all the SC
  let tx =
    await scForRegression.homeFiProxyContract.upgradeMultipleImplementations(
      [utf8ToHex('HF')],
      [scForRegression.homeFiV3MockContract.address],
    );
  tx.wait();

  tx = await scForRegression.homeFiProxyContract.upgradeMultipleImplementations(
    [utf8ToHex('CN')],
    [scForRegression.communityV2MockContract.address],
  );
  tx.wait();

  tx = await scForRegression.homeFiProxyContract.upgradeMultipleImplementations(
    [utf8ToHex('DP')],
    [scForRegression.disputesV2MockContract.address],
  );
  tx.wait();

  tx = await scForRegression.homeFiProxyContract.upgradeMultipleImplementations(
    [utf8ToHex('PF')],
    [scForRegression.projectFactoryV2Contract.address],
  );
  tx.wait();
  tx = await scForRegression.homeFiProxyContract.upgradeMultipleImplementations(
    [utf8ToHex('DA')],
    [scForRegression.debtTokenV2MockContract.address],
  );
  tx.wait();
  // we upgraded the implementation of the ProjectFactory but the initialization of the projectFactory is still the same
  // thus the implementation still point to the first Project version
  const projectImplementationV2Contract = await deploy<ProjectV2Mock>(
    'ProjectV2Mock',
    {
      Tasks: scForRegression.tasksLibrary.address,
    },
  );
  // we can't run initialize again so we need to upgrade the underlying implementation
  // used by the project factory to clone project
  // as we use a proxy we should call the changeProjectImplementation by calling the PojectProxy's proxy
  const PFfromHomeFi =
    await scForRegression.homeFiContract.projectFactoryInstance();
  const curProjectFactory = await getContractAt<ProjectFactory>(
    'ProjectFactory',
    PFfromHomeFi,
  );

  await curProjectFactory.changeProjectImplementation(
    projectImplementationV2Contract.address,
  );
  scForRegression.projectImplementationContract =
    projectImplementationV2Contract;

  const projectProxyProxyAddress =
    await scForRegression.homeFiProxyContract.getLatestAddress(utf8ToHex('PF'));
  const projectProxyImplementation =
    await scForRegression.proxyAdmin.getProxyImplementation(
      projectProxyProxyAddress,
    );

  const projectProxyUnderlying = await curProjectFactory.underlying();

  return [scForUpgradability, scForRegression];
};

setup().then(tests => {
  describe('Upgradability Suit', async () => {
    describe('Upgradability Test', async () => {
      it('should not be upgraded contracts', async () => {
        const homeFiProxyAddress =
          await tests[0].homeFiProxyContract.getLatestAddress(utf8ToHex('HF'));
        const communityProxyAddress =
          await tests[0].homeFiProxyContract.getLatestAddress(utf8ToHex('CN'));
        const disputesProxyAddress =
          await tests[0].homeFiProxyContract.getLatestAddress(utf8ToHex('DP'));
        const debtTokenDAProxyAddress =
          await tests[0].homeFiProxyContract.getLatestAddress(utf8ToHex('DA'));
        const proxyFactoryAddress =
          await tests[0].homeFiProxyContract.getLatestAddress(utf8ToHex('PF'));
        expect(await tests[0].homeFiContract.projectFactoryInstance()).to.equal(
          proxyFactoryAddress,
        );

        expect(tests[0].homeFiV3MockContract.address).to.not.equal(
          await tests[0].proxyAdmin.getProxyImplementation(homeFiProxyAddress),
        );
        expect(tests[0].communityV2MockContract.address).to.not.equal(
          await tests[0].proxyAdmin.getProxyImplementation(
            communityProxyAddress,
          ),
        );
        expect(tests[0].disputesV2MockContract.address).to.not.equal(
          await tests[0].proxyAdmin.getProxyImplementation(
            disputesProxyAddress,
          ),
        );
        expect(tests[0].debtTokenV2MockContract.address).to.not.equal(
          await tests[0].proxyAdmin.getProxyImplementation(
            debtTokenDAProxyAddress,
          ),
        );
        expect(tests[0].projectFactoryV2Contract.address).to.not.equal(
          await tests[0].proxyAdmin.getProxyImplementation(proxyFactoryAddress),
        );
      });
      describe('HomeFi Upgradability', () => {
        homeFiUpgradabilityTests(tests[0]);
      });
      describe('ProjectFactory Upgradability', () => {
        projectFactoryUpgradabilityTests(tests[0]);
      });
      describe('Project Upgradability', () => {
        projectUpgradabilityTests(tests[0]);
      });
      describe('DebtToken Upgradability', () => {
        debtTokenUpgradabilityTests(tests[0]);
      });
      describe('Disputes Upgradability', () => {
        disputesUpgradabilityTests(tests[0]);
      });
      describe('Community Upgradability', () => {
        communityUpgradabilityTests(tests[0]);
      });
    });

    describe('Regression tests', async () => {
      it('should be upgraded contracts', async () => {
        const homeFiProxyAddress =
          await tests[1].homeFiProxyContract.getLatestAddress(utf8ToHex('HF'));
        const communityProxyAddress =
          await tests[1].homeFiProxyContract.getLatestAddress(utf8ToHex('CN'));
        const disputesProxyAddress =
          await tests[1].homeFiProxyContract.getLatestAddress(utf8ToHex('DP'));
        const debtTokenDAProxyAddress =
          await tests[1].homeFiProxyContract.getLatestAddress(utf8ToHex('DA'));
        const proxyFactoryAddress =
          await tests[1].homeFiProxyContract.getLatestAddress(utf8ToHex('PF'));

        const curProjectFactory = await getContractAt<ProjectFactory>(
          'ProjectFactory',
          proxyFactoryAddress,
        );
        expect(await curProjectFactory.underlying()).to.equal(
          tests[1].projectImplementationContract.address,
        );

        expect(await tests[1].homeFiContract.projectFactoryInstance()).to.equal(
          proxyFactoryAddress,
        );

        expect(tests[1].homeFiV3MockContract.address).to.equal(
          await tests[1].proxyAdmin.getProxyImplementation(homeFiProxyAddress),
        );
        expect(tests[1].communityV2MockContract.address).to.equal(
          await tests[1].proxyAdmin.getProxyImplementation(
            communityProxyAddress,
          ),
        );
        expect(tests[1].disputesV2MockContract.address).to.equal(
          await tests[1].proxyAdmin.getProxyImplementation(
            disputesProxyAddress,
          ),
        );
        expect(tests[1].debtTokenV2MockContract.address).to.equal(
          await tests[1].proxyAdmin.getProxyImplementation(
            debtTokenDAProxyAddress,
          ),
        );
        // proxyFactory should point to a V2 implementation
        expect(tests[1].projectFactoryV2Contract.address).to.equal(
          await tests[1].proxyAdmin.getProxyImplementation(proxyFactoryAddress),
        );
        const curProjectFactoryV2 = await getContractAt<ProjectFactory>(
          'ProjectFactory',
          proxyFactoryAddress,
        );

        expect(
          await curProjectFactoryV2.isTrustedForwarder(
            tests[1].forwarder.address,
          ),
        ).to.be.true;
      });
      it('Check latest upgraded version', async () => {
        // Just to check if tests are on latest upgrade.
        const homeFiV3MockContract = await getContractAt<HomeFiV3Mock>(
          'HomeFiV3Mock',
          tests[1].homeFiContract.address,
        );
        const communityV2Contract = await getContractAt<Community>(
          'Community',
          tests[1].communityContract.address,
        );
        const disputesV2MockContract = await getContractAt<DisputesV2Mock>(
          'DisputesV2Mock',
          tests[1].disputesContract.address,
        );
        const debtTokenV2MockContract = await getContractAt<DebtTokenV2Mock>(
          'DebtTokenV2Mock',
          tests[1].rDAIContract.address,
        );
        const ProjectFactoryV2Contract = await getContractAt<ProjectFactory>(
          'ProjectFactory',
          await tests[1].homeFiContract.projectFactoryInstance(),
        );
        await homeFiV3MockContract.setAddrFalse();
        expect(await homeFiV3MockContract.addrSet2()).to.equal(true);
        expect(await homeFiV3MockContract.newVariable()).to.equal(0);
        await disputesV2MockContract.setNewVariable();
        expect(await disputesV2MockContract.newVariable()).to.equal(true);
        await debtTokenV2MockContract.setNewVariable();
        expect(await debtTokenV2MockContract.newVariable()).to.equal(true);
        expect(
          await ProjectFactoryV2Contract.isTrustedForwarder(
            tests[1].forwarder.address,
          ),
        ).to.be.true;
      });
      describe('HomeFi Regression', () => {
        homeFiTests(tests[1]);
      });
      describe('projectFactory Regression', () => {
        projectFactoryTests(tests[1]);
      });
      describe('Community Regression', () => {
        communityTests(tests[1]);
      });
      describe('Dispute Regression', async () => {
        const projectV2Mock1Address = (
          await createProjectWithoutContractor(
            tests[1].homeFiContract,
            tests[1].tasksLibrary.address,
            '0x',
            tests[1].tokenCurrency1,
          )
        ).project;
        const projectV2Mock2Address = (
          await createProjectWithoutContractor(
            tests[1].homeFiContract,
            tests[1].tasksLibrary.address,
            '0x',
            tests[1].tokenCurrency1,
          )
        ).project;
        const etherProjectV2MockAddress = (
          await createProjectWithoutContractor(
            tests[1].homeFiContract,
            tests[1].tasksLibrary.address,
            '0x',
            tests[1].nativeCurrency,
          )
        ).project;

        tests[1].project = await getContractAt<ProjectV2Mock>(
          'ProjectV2Mock',
          projectV2Mock1Address,
        );
        tests[1].project2 = await getContractAt<ProjectV2Mock>(
          'ProjectV2Mock',
          projectV2Mock2Address,
        );
        tests[1].etherProject = await getContractAt<ProjectV2Mock>(
          'ProjectV2Mock',
          etherProjectV2MockAddress,
        );
        await disputeTests(tests[1]);
      });
      describe('DebtToken Regression', () => {
        debtTokenTests(tests[1]);
      });
      describe('project Regression', () => {
        tests[1].project = tests[1].project3;
        tests[1].project2 = tests[1].project4;
        tests[1].etherProject = tests[1].etherProject2;
        projectTests(tests[1]);
      });
      describe('project Regression with V2 Project', async () => {
        const projectV2Mock1Address = (
          await createProjectWithoutContractor(
            tests[1].homeFiContract,
            tests[1].tasksLibrary.address,
            '0x',
            tests[1].tokenCurrency1,
          )
        ).project;
        const projectV2Mock2Address = (
          await createProjectWithoutContractor(
            tests[1].homeFiContract,
            tests[1].tasksLibrary.address,
            '0x',
            tests[1].tokenCurrency1,
          )
        ).project;
        const etherProjectV2MockAddress = (
          await createProjectWithoutContractor(
            tests[1].homeFiContract,
            tests[1].tasksLibrary.address,
            '0x',
            tests[1].nativeCurrency,
          )
        ).project;
        const pfi = await tests[1].homeFiContract.projectFactoryInstance();
        const curProjectFactory = await getContractAt<ProjectFactory>(
          'ProjectFactory',
          pfi,
        );

        tests[1].project = await getContractAt<ProjectV2Mock>(
          'ProjectV2Mock',
          projectV2Mock1Address,
        );
        tests[1].project2 = await getContractAt<ProjectV2Mock>(
          'ProjectV2Mock',
          projectV2Mock2Address,
        );
        tests[1].etherProject = await getContractAt<ProjectV2Mock>(
          'ProjectV2Mock',
          etherProjectV2MockAddress,
        );

        projectTests(tests[1]);
        describe('Project Regression with V2 Project - ADDON', async () => {
          it('cloned Project should be Project V2', async () => {
            const pFi = await tests[1].homeFiContract.projectFactoryInstance();

            const pFic = await getContractAt<ProjectFactory>(
              'ProjectFactory',
              pFi,
            );

            const proj = await getContractAt<ProjectV2Mock>(
              'ProjectV2Mock',
              tests[1].project2.address,
            );
            await proj.setNewVariable();
            expect(await proj.newVariable()).to.be.true;
          });
        });
      });
    });
  });
  run();
});
