import { expect } from 'chai';
import { ethers } from 'hardhat';
import { utf8ToHex } from '.';
import { ProjectFactory } from '../../artifacts/types/ProjectFactory';
import { HomeFiProxy } from '../../artifacts/types/HomeFiProxy';
import { ProjectV2Mock } from '../../artifacts/types/ProjectV2Mock';
import { deploy, getContractAt } from './ethersHelpers';
import { Project } from '../../artifacts/types/Project';
import { MinimalForwarder } from '../../artifacts/types/MinimalForwarder';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

export const projectFactoryUpgradabilityTests = async ({
  homeFiProxyContract,
  projectFactoryV2Contract,
  projectImplementationContract,
  signers,
  forwarder,
  tasksLibrary,
}: {
  homeFiProxyContract: HomeFiProxy;
  projectFactoryV2Contract: ProjectFactory;
  projectImplementationContract: Project;
  forwarder: MinimalForwarder;
  signers: SignerWithAddress[];
  tasksLibrary: any;
}) => {
  it('should be able to upgrade homeFi contract to V2', async () => {
    const tx = await homeFiProxyContract.upgradeMultipleImplementations(
      [utf8ToHex('PF')],
      [projectFactoryV2Contract.address],
    );
    // implementation
    const transparentProxy = await homeFiProxyContract.getLatestAddress(
      utf8ToHex('PF'),
    );
    const proxyAdmin = await homeFiProxyContract.proxyAdmin();
    const ProxyAdminContractFactory = await ethers.getContractFactory(
      'ProxyAdmin',
    );
    const proxyAdminContract = ProxyAdminContractFactory.attach(proxyAdmin);
    expect(
      await proxyAdminContract.getProxyImplementation(transparentProxy),
    ).to.equal(projectFactoryV2Contract.address);
    projectFactoryV2Contract = await getContractAt<ProjectFactory>(
      'ProjectFactory',
      transparentProxy,
    );
  });

  it('should be able to retrieve new state variable', async () => {
    await projectFactoryV2Contract.changeProjectImplementation(
      homeFiProxyContract.address,
    );
  });

  it('should be able to call newly added functions', async () => {
    await expect(
      projectFactoryV2Contract
        .connect(signers[1])
        .changeProjectImplementation(projectImplementationContract.address),
    ).to.be.revertedWith('ProjectFactory::!Owner');
    await projectFactoryV2Contract.changeProjectImplementation(
      projectImplementationContract.address,
    );

    expect(await projectFactoryV2Contract.underlying()).to.equal(
      projectImplementationContract.address,
    );
  });

  it('should check implementation', async () => {
    expect(await projectFactoryV2Contract.underlying()).to.equal(
      projectImplementationContract.address,
    );
  });

  it('should be able to update the implementation', async () => {
    // changeImplementation
    const projectV2ImplementationContract = await deploy<ProjectV2Mock>(
      'ProjectV2Mock',
      {
        Tasks: tasksLibrary.address,
      },
    );
    const tx = await projectFactoryV2Contract.changeProjectImplementation(
      projectV2ImplementationContract.address,
    );
    expect(await projectFactoryV2Contract.underlying()).to.equal(
      projectV2ImplementationContract.address,
    );
  });
};
