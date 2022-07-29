import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DebtToken } from '../../artifacts/types/DebtToken';
import { ProjectFactory } from '../../artifacts/types/ProjectFactory';
import { deploy } from './ethersHelpers';

export const projectFactoryTests = async ({
  projectFactoryContract,
  signers,
  rDAIContract,
}: {
  projectFactoryContract: ProjectFactory;
  signers: SignerWithAddress[];
  rDAIContract: DebtToken;
}) => {
  it('should revert when initialize with zero address', async () => {
    const ProjectFactoryImplementation = await deploy<ProjectFactory>(
      'ProjectFactory',
    );

    const tx = ProjectFactoryImplementation.initialize(
      signers[0].address,
      ethers.constants.AddressZero,
    );
    await expect(tx).to.be.revertedWith('PF::0 address');
  });

  it('should revert create project when sender is not HomeFi', async () => {
    const tx = projectFactoryContract.createProject(
      rDAIContract.address,
      signers[1].address,
    );
    await expect(tx).to.be.revertedWith('PF::!HomeFiContract');
  });
};
