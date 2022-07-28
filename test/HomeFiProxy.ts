import { ContractFactory } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Community } from '../artifacts/types/Community';
import { DebtToken } from '../artifacts/types/DebtToken';
import { Disputes } from '../artifacts/types/Disputes';
import { HomeFi } from '../artifacts/types/HomeFi';
import { HomeFiProxy } from '../artifacts/types/HomeFiProxy';
import { ProjectFactory } from '../artifacts/types/ProjectFactory';
import { utf8ToHex } from './utils';
import { deploy } from './utils/ethersHelpers';

const setup = async () => {
  describe('HomeFiProxy', () => {
    let ProxyAdminContractFactory: ContractFactory;
    let signers: SignerWithAddress[];
    let homeFiProxyContract: HomeFiProxy;
    let implementations: string[];

    before('Deploy uninitialized contract', async () => {
      signers = await ethers.getSigners();
      const TasksContractFactory = await ethers.getContractFactory('Tasks');
      const tasksLibrary = await TasksContractFactory.deploy();
      await tasksLibrary.deployed();

      ProxyAdminContractFactory = await ethers.getContractFactory('ProxyAdmin');

      const homeFiContractImplementation = await deploy<HomeFi>('HomeFi');

      const communityContractImplementation = await deploy<Community>(
        'Community',
      );
      const disputesContractImplementation = await deploy<Disputes>('Disputes');

      const rETHContractImplementation = await deploy<DebtToken>('DebtToken');

      const rDAIContractImplementation = await deploy<DebtToken>('DebtToken');

      const rUSDCContractImplementation = await deploy<DebtToken>('DebtToken');

      const projectFactoryImplementation = await deploy<ProjectFactory>(
        'ProjectFactory',
      );

      homeFiProxyContract = await deploy<HomeFiProxy>('HomeFiProxy');

      implementations = [
        homeFiContractImplementation.address,
        communityContractImplementation.address,
        disputesContractImplementation.address,
        projectFactoryImplementation.address,
        rETHContractImplementation.address,
        rDAIContractImplementation.address,
        rUSDCContractImplementation.address,
      ];
    });

    it('should revert when implementation array length mis match to allContractNames', async () => {
      const tempImplementation = [homeFiProxyContract.address];
      const tx = homeFiProxyContract
        .connect(signers[0])
        .initiateHomeFi(tempImplementation);
      await expect(tx).to.be.revertedWith('Proxy::Lengths !match');
    });

    it('should initiate HomeFiProxy', async () => {
      await (await homeFiProxyContract.initiateHomeFi(implementations)).wait();
    });

    it('should have initialized correctly', async () => {
      const contractNames = ['HF', 'CN', 'DP', 'PF', 'DA', 'US', 'NT'];
      for (let i = 0; i < implementations.length; i++) {
        expect(await homeFiProxyContract.allContractNames(i)).to.equal(
          utf8ToHex(contractNames[i]),
        );
        let activeContract = await homeFiProxyContract.getLatestAddress(
          utf8ToHex(contractNames[i]),
        );
        expect(await homeFiProxyContract.isActive(activeContract)).to.equal(
          true,
        );
      }
    });

    it('should revert when try to initialize again', async () => {
      const tx = homeFiProxyContract
        .connect(signers[0])
        .initiateHomeFi(implementations);
      await expect(tx).to.be.revertedWith(
        'Initializable: contract is already initialized',
      );
    });

    it('should revert when sender is not proxyAdmin owner', async () => {
      const proxyAdminProxy = await ProxyAdminContractFactory.deploy();
      await proxyAdminProxy.deployed();
      const tx = homeFiProxyContract
        .connect(signers[1])
        .addNewContract(utf8ToHex('PA'), proxyAdminProxy.address);
      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should be able to add new contract', async () => {
      const proxyAdminProxy = await ProxyAdminContractFactory.deploy();
      await proxyAdminProxy.deployed();
      await (
        await homeFiProxyContract.addNewContract(
          utf8ToHex('PA'),
          proxyAdminProxy.address,
        )
      ).wait();
      expect(await homeFiProxyContract.allContractNames(7)).to.equal(
        utf8ToHex('PA'),
      );
    });

    it('should revert when adding new contract with 0 address', async () => {
      const tx = homeFiProxyContract
        .connect(signers[0])
        .addNewContract(utf8ToHex('XX'), ethers.constants.AddressZero);
      await expect(tx).to.be.revertedWith('Proxy::0 address');
    });

    it('should revert when adding new contract with existing name', async () => {
      const proxyAdminProxy = await ProxyAdminContractFactory.deploy();
      await proxyAdminProxy.deployed();
      const tx = homeFiProxyContract
        .connect(signers[0])
        .addNewContract(utf8ToHex('PA'), proxyAdminProxy.address);
      await expect(tx).to.be.revertedWith('Proxy::Name !OK');
    });

    it('should revert when upgrade implementation with unequal contract name and address', async () => {
      const tx = homeFiProxyContract
        .connect(signers[0])
        .upgradeMultipleImplementations([utf8ToHex('HF')], []);
      await expect(tx).to.be.revertedWith('Proxy::Lengths !match');
    });

    it('should revert when upgrade implementation with 0 address', async () => {
      const tx = homeFiProxyContract
        .connect(signers[0])
        .upgradeMultipleImplementations(
          [utf8ToHex('HF')],
          [ethers.constants.AddressZero],
        );
      await expect(tx).to.be.revertedWith('Proxy::0 address');
    });

    it('should be able to upgrade multiple implementations', async () => {
      const newHomeFiContractImplementation = await deploy<HomeFi>('HomeFi');
      await (
        await homeFiProxyContract.upgradeMultipleImplementations(
          [utf8ToHex('HF')],
          [newHomeFiContractImplementation.address],
        )
      ).wait();
      expect(await homeFiProxyContract.allContractNames(0)).to.equal(
        utf8ToHex('HF'),
      );
      let activeContract = await homeFiProxyContract.getLatestAddress(
        utf8ToHex('HF'),
      );
      expect(await homeFiProxyContract.isActive(activeContract)).to.equal(true);
    });

    it('should revert when try to change proxyAdmin owner with non owner of HomeFiProxy', async () => {
      const tx = homeFiProxyContract
        .connect(signers[1])
        .changeProxyAdminOwner(signers[2].address);
      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert when try to change proxyAdmin owner with 0 address', async () => {
      const tx = homeFiProxyContract
        .connect(signers[0])
        .changeProxyAdminOwner(ethers.constants.AddressZero);
      await expect(tx).to.be.revertedWith('Proxy::0 address');
    });

    it('should be able to change proxyAdmin owner', async () => {
      const proxyAdmin = await ProxyAdminContractFactory.attach(
        await homeFiProxyContract.proxyAdmin(),
      );
      await expect(await proxyAdmin.owner()).to.be.equal(
        homeFiProxyContract.address,
      );
      await (
        await homeFiProxyContract
          .connect(signers[0])
          .changeProxyAdminOwner(signers[2].address)
      ).wait();
      await expect(await proxyAdmin.owner()).to.be.equal(signers[2].address);
    });
  });
};

setup().then(() => {
  run();
});
