import { expect } from 'chai';
import { BigNumber, constants, Contract } from 'ethers';
import { ethers, network } from 'hardhat';
import { HomeFi } from '../../artifacts/types/HomeFi';
import { getCommunityID, multisig, currentTimestamp, encodeData } from '.';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Project } from '../../artifacts/types/Project';
import { Community } from '../../artifacts/types/Community';
import { MockContract } from 'ethereum-waffle';
import { DebtToken } from '../../artifacts/types/DebtToken';
import { migrate } from './migrationHelpers';
import {
  createProject,
  createProjectWithoutContractor,
  createTasks,
} from './projectHelpers';
import { mineBlock, setNextBlockTimestamp } from './hardhatNode';
import { deploy } from './ethersHelpers';

// Copied from communityTests- full test suit for community contracts
export const communityTests = async ({
  treasury,
  lenderFee,
  communityContract,
  homeFiContract,
  tokenCurrency1,
  nativeCurrency,
  signers,
  project,
  project2,
  mockETHContract,
  mockDAIContract,
  rDAIContract,
  rETHContract,
  etherProject,
  tasksLibrary,
}: {
  treasury: any;
  lenderFee: any;
  communityContract: Community;
  homeFiContract: HomeFi;
  tokenCurrency1: string;
  nativeCurrency: string;
  signers: SignerWithAddress[];
  project: Project;
  project2: Project;
  mockETHContract: MockContract;
  mockDAIContract: MockContract;
  rETHContract: DebtToken;
  rDAIContract: DebtToken;
  etherProject: Project;
  tasksLibrary: Contract;
}) => {
  let projectAddress = project.address;
  let etherProjectAddress = etherProject.address;

  const ONE_DAY = 86400;
  const sampleHash = '0x1234';
  let apr: number = 0;
  let totalLent: number = 0;
  let etherTotalLend: number = 0;
  let lendingNeeded: BigNumber;
  let etherLendingNeeded: BigNumber;
  let community1Owner = signers[2];
  let community2Owner = signers[1];
  let community3Owner = signers[3];
  const publishFeeAmount = ethers.utils.parseEther('1');

  let lendingTimestamp: number;
  let lendingPrincipal: number;
  let lendingInterest: number;
  let lendingReturn: number;

  it('should be initialised properly', async () => {
    expect(await communityContract.homeFi()).to.equal(homeFiContract.address);
    expect(await communityContract.communityCount()).to.equal(0);
    expect(await communityContract.restrictedToAdmin()).to.equal(true);
  });

  describe('paused()', () => {
    it('should pause if unpaused and admin', async () => {
      const tx = await communityContract.connect(signers[0]).pause();
      await expect(tx)
        .to.emit(communityContract, 'Paused')
        .withArgs(signers[0].address);
      expect(await communityContract.paused()).to.equal(true);
    });
    it('should revert pause if not admin', async () => {
      const tx = communityContract.connect(signers[2]).pause();
      await expect(tx).to.be.revertedWith('Community::!admin');
    });
    it('should revert if already paused', async () => {
      const tx = communityContract.connect(signers[0]).pause();
      await expect(tx).to.be.revertedWith('Pausable: paused');
    });
    it('should revert if paused functions are called ', async () => {
      const randomHash = '0x0a19';

      await expect(
        communityContract.createCommunity(randomHash, tokenCurrency1),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        communityContract.publishProject(randomHash, randomHash),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        communityContract.unpublishProject(1, signers[0].address),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        communityContract.payPublishFee(1, signers[0].address),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        communityContract.toggleLendingNeeded(1, signers[0].address, 1),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        communityContract.lendToProject(1, signers[0].address, 1, randomHash),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        communityContract.reduceDebt(1, signers[0].address, 1, randomHash),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        communityContract.repayLender(1, signers[0].address, 1),
      ).to.be.revertedWith('Pausable: paused');
      await expect(
        communityContract.escrow(randomHash, randomHash),
      ).to.be.revertedWith('Pausable: paused');
    });
  });

  describe('unpaused()', () => {
    it('should revert if not admin', async () => {
      const tx = communityContract.connect(signers[2]).unpause();
      await expect(tx).to.be.revertedWith('Community::!admin');
    });
    it('should unpause if paused and admin', async () => {
      const tx = await communityContract.connect(signers[0]).unpause();
      await expect(tx)
        .to.emit(communityContract, 'Unpaused')
        .withArgs(signers[0].address);
      expect(await communityContract.paused()).to.equal(false);
    });
    it('should revert if already unpaused', async () => {
      const tx = communityContract.connect(signers[0]).unpause();
      await expect(tx).to.be.revertedWith('Pausable: not paused');
    });
  });

  describe('unrestrictToAdmin()', () => {
    it('should revert if not admin', async () => {
      const tx = communityContract.connect(signers[2]).unrestrictToAdmin();
      await expect(tx).to.be.revertedWith('Community::!admin');
    });
    it('should unpause if paused and admin', async () => {
      const tx = await communityContract
        .connect(signers[0])
        .unrestrictToAdmin();
      await expect(tx)
        .to.emit(communityContract, 'UnrestrictedToAdmin')
        .withArgs(signers[0].address);
      expect(await communityContract.restrictedToAdmin()).to.equal(false);
    });
    it('should revert if already unpaused', async () => {
      const tx = communityContract.connect(signers[0]).unrestrictToAdmin();
      await expect(tx).to.be.revertedWith('Community::!restricted');
    });
  });

  describe('restrictToAdmin()', () => {
    it('should pause if unpaused and admin', async () => {
      const tx = await communityContract.connect(signers[0]).restrictToAdmin();
      await expect(tx)
        .to.emit(communityContract, 'RestrictedToAdmin')
        .withArgs(signers[0].address);
      expect(await communityContract.restrictedToAdmin()).to.equal(true);
    });
    it('should revert pause if not admin', async () => {
      const tx = communityContract.connect(signers[2]).restrictToAdmin();
      await expect(tx).to.be.revertedWith('Community::!admin');
    });
    it('should revert if already paused', async () => {
      const tx = communityContract.connect(signers[0]).restrictToAdmin();
      await expect(tx).to.be.revertedWith('Community::restricted');
    });
  });

  describe('createCommunity()', () => {
    it('should revert if not admin and paused', async () => {
      const randomHash = '0x0a19';
      const tx = communityContract
        .connect(signers[2])
        .createCommunity(randomHash, tokenCurrency1);
      await expect(tx).to.be.revertedWith('Community::!admin');
    });
    it('should create new community when unpaused (sender non-admin/admin)', async () => {
      await communityContract.connect(signers[0]).unrestrictToAdmin();
      expect(await communityContract.restrictedToAdmin()).to.equal(false);
      const randomHash = '0x0a19';
      // no community should exist prior to this one
      expect(await communityContract.communityCount()).to.equal(0);
      const tx = await communityContract
        .connect(signers[2])
        .createCommunity(randomHash, tokenCurrency1);
      const _communityID = await getCommunityID(tx);

      expect(_communityID).to.equal(1);
      expect(await communityContract.communityCount()).to.equal(1);
      await expect(tx)
        .to.emit(communityContract, 'CommunityAdded')
        .withArgs(1, signers[2].address, tokenCurrency1, randomHash);

      const members = await communityContract.members(_communityID);
      const [
        projApr,
        projectLendingNeeded,
        totalLent,
        publishFee,
        publishFeePaid,
      ] = await communityContract.projectDetails(_communityID, project.address);

      expect(members.length).to.equal(1);
      expect(projApr).to.equal(apr);
      expect(projectLendingNeeded).to.equal(0);
      expect(totalLent).to.equal(apr);
      expect(publishFee).to.equal(0);
      expect(publishFeePaid).to.equal(false);
      expect(members[0]).to.equal(signers[2].address);

      const { owner, currency, memberCount, publishNonce } =
        await communityContract.communities(_communityID);
      expect(owner).to.equal(signers[2].address);
      expect(currency).to.equal(tokenCurrency1);
      expect(memberCount).to.equal(1);
      expect(publishNonce).to.equal(0);
    });
    it('should create another community', async () => {
      const randomHash = '0x0a18';
      expect(await communityContract.communityCount()).to.equal(1);
      const tx = await communityContract
        .connect(signers[1])
        .createCommunity(randomHash, nativeCurrency);
      const _communityID = await getCommunityID(tx);

      expect(_communityID).to.equal(2);
      expect(await communityContract.communityCount()).to.equal(2);
      await expect(tx)
        .to.emit(communityContract, 'CommunityAdded')
        .withArgs(2, signers[1].address, nativeCurrency, randomHash);
      const members = await communityContract.members(_communityID);

      const [projectApr, projectLendingNeeded] =
        await communityContract.projectDetails(_communityID, project.address);

      expect(members.length).to.equal(1);

      expect(projectApr).to.equal(0);
      expect(projectLendingNeeded).to.equal(0);
      expect(members[0]).to.equal(signers[1].address);

      const { owner, currency, memberCount, publishNonce } =
        await communityContract.communities(_communityID);
      expect(owner).to.equal(signers[1].address);
      expect(currency).to.equal(nativeCurrency);
      expect(memberCount).to.equal(1);
      expect(publishNonce).to.equal(0);
    });
    it('should create a third community', async () => {
      const randomHash = '0x0a18';
      await communityContract
        .connect(community3Owner)
        .createCommunity(randomHash, nativeCurrency);
    });
  });

  describe('updateCommunityHash()', () => {
    it('should revert if not owner', async () => {
      const newHash = '0x0a192a';
      const tx = communityContract
        .connect(signers[1])
        .updateCommunityHash(0, newHash);
      await expect(tx).to.be.revertedWith('Community::!owner');
    });
    it('should update hash', async () => {
      const newHash = '0x0a192a';
      const tx = await communityContract
        .connect(signers[2])
        .updateCommunityHash(1, newHash);
      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'UpdateCommunityHash')
        .withArgs(1, newHash);
    });
  });

  describe('addMember()', () => {
    it('should revert if invalid signature or data', async () => {
      const data = {
        types: ['uint256', 'address', 'bytes'],
        values: [1, communityContract.address, sampleHash],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[2],
        signers[1],
      ]);
      const tx = communityContract.addMember(encodedData, signature);

      await expect(tx).to.be.revertedWith('Community::invalid signature');
    });
    it('should revert if invalid signature is zero address', async () => {
      const data = {
        types: ['uint256', 'address', 'bytes'],
        values: [1, communityContract.address, sampleHash],
      };
      const [encodedData, signature] = await multisig(data, [signers[1]]);
      const tx = communityContract.addMember(encodedData, signature);

      await expect(tx).to.be.revertedWith('Community::invalid signature');
    });
    it('should add member to community 1', async () => {
      const data = {
        types: ['uint256', 'address', 'bytes'],
        values: [1, signers[1].address, sampleHash],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[2],
        signers[1],
      ]);

      const tx = await communityContract
        .connect(signers[2])
        .addMember(encodedData, signature);
      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'MemberAdded(uint256,address,bytes)')
        .withArgs(1, signers[1].address, sampleHash);
      const members = await communityContract.members(1);
      expect(members.length).to.equal(2);
      expect(members[0]).to.equal(signers[2].address);
      expect(members[1]).to.equal(signers[1].address);

      const { memberCount } = await communityContract.communities(1);
      expect(memberCount).to.equal(2);
    });
    it('should add another member to community 1', async () => {
      const data = {
        types: ['uint256', 'address', 'bytes'],

        values: [1, signers[0].address, sampleHash],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[2],
        signers[0],
      ]);

      const tx = await communityContract
        .connect(signers[0])
        .addMember(encodedData, signature);
      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'MemberAdded(uint256,address,bytes)')

        .withArgs(1, signers[0].address, sampleHash);
      const members = await communityContract.members(1);

      expect(members.length).to.equal(3);
      expect(members[0]).to.equal(signers[2].address);
      expect(members[1]).to.equal(signers[1].address);
      expect(members[2]).to.equal(signers[0].address);

      const { memberCount } = await communityContract.communities(1);
      expect(memberCount).to.equal(3);
    });
    it('should add member to second community', async () => {
      const data = {
        types: ['uint256', 'address', 'bytes'],
        values: [2, signers[0].address, sampleHash],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[1],
        signers[0],
      ]);

      const tx = await communityContract
        .connect(signers[0])
        .addMember(encodedData, signature);
      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'MemberAdded(uint256,address,bytes)')
        .withArgs(2, signers[0].address, sampleHash);
      const members = await communityContract.members(2);

      expect(members.length).to.equal(2);
      expect(members[0]).to.equal(signers[1].address);
      expect(members[1]).to.equal(signers[0].address);

      const { memberCount } = await communityContract.communities(2);
      expect(memberCount).to.equal(2);
    });
    it('should add member to third community', async () => {
      const data = {
        types: ['uint256', 'address', 'bytes'],
        values: [3, signers[0].address, sampleHash],
      };
      const [encodedData, signature] = await multisig(data, [
        community3Owner,
        signers[0],
      ]);

      const tx = await communityContract
        .connect(signers[0])
        .addMember(encodedData, signature);
      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'MemberAdded(uint256,address,bytes)')
        .withArgs(3, signers[0].address, sampleHash);

      const members = await communityContract.members(3);

      expect(members.length).to.equal(2);
      expect(members[0]).to.equal(community3Owner.address);
      expect(members[1]).to.equal(signers[0].address);

      const { memberCount } = await communityContract.communities(3);
      expect(memberCount).to.equal(2);
    });
    it('should revert add existing member', async () => {
      const data = {
        types: ['uint256', 'address', 'bytes'],
        values: [2, signers[1].address, sampleHash],
      };
      const [encodedData, signature] = await multisig(data, [
        signers[1],
        signers[1],
      ]);

      const tx = communityContract
        .connect(signers[0])
        .addMember(encodedData, signature);

      await expect(tx).to.be.revertedWith('Community::Member Exists');
    });
  });

  describe('publishProject()', () => {
    it('should revert if wrong encoded project count', async () => {
      const data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          1,
          projectAddress,
          0,
          0,
          (await communityContract.communities(1)).publishNonce.add(1), // wrong project count
          sampleHash,
        ],
      };

      const [encodedData, signature] = await multisig(data, [
        community1Owner,
        signers[1],
      ]);

      const tx = communityContract.publishProject(encodedData, signature);
      await expect(tx).to.be.revertedWith('Community::invalid publishNonce');
    });
    it('should revert if project not exists', async () => {
      let nonHomeFiProject: Project;
      const newMigration = await migrate();
      ({ projectContractInstance: nonHomeFiProject } =
        await createProjectWithoutContractor(
          newMigration.homeFiContract,
          newMigration.tasksLibrary.address,
          '0x',
          await newMigration.homeFiContract.tokenCurrency1(),
        ));

      const data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          1,
          nonHomeFiProject.address,
          0,
          0,
          (await communityContract.communities(1)).publishNonce,
          sampleHash,
        ],
      };

      const [encodedData, signature] = await multisig(data, [
        community1Owner,
        signers[0],
      ]);

      const tx = communityContract.publishProject(encodedData, signature);
      await expect(tx).to.be.revertedWith('Community::Project !Exists');
    });
    it('should revert if not member', async () => {
      const nonMember = signers[4];
      let newProject: Project;
      ({ projectContractInstance: newProject } =
        await createProjectWithoutContractor(
          homeFiContract,
          tasksLibrary.address,
          '0x',
          await homeFiContract.tokenCurrency1(),
          nonMember,
        ));

      const data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          1,
          newProject.address,
          0,
          0,
          (await communityContract.communities(1)).publishNonce,
          sampleHash,
        ],
      };

      const [encodedData, signature] = await multisig(data, [
        community1Owner,
        nonMember,
      ]);
      const tx = communityContract.publishProject(encodedData, signature);
      await expect(tx).to.be.revertedWith('Community::!Member');
    });
    it('should revert if currency mismatch', async () => {
      const data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          2,
          projectAddress,
          0,
          0,
          (await communityContract.communities(2)).publishNonce,
          sampleHash,
        ],
      };

      const [encodedData, signature] = await multisig(data, [
        community1Owner,
        signers[1],
      ]);

      const tx = communityContract.publishProject(encodedData, signature);
      await expect(tx).to.be.revertedWith('Community::!Currency');
    });
    it('should revert if not builder', async () => {
      const data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          1,
          projectAddress,
          0,
          0,
          (await communityContract.communities(1)).publishNonce,
          sampleHash,
        ],
      };

      const [encodedData, signature] = await multisig(data, [
        community1Owner,
        signers[1],
      ]);

      const tx = communityContract.publishProject(encodedData, signature);
      await expect(tx).to.be.revertedWith('Community::invalid signature');
    });
    it('should publish project', async () => {
      apr = 10;
      const communityId = 1;

      const data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          communityId,
          projectAddress,
          apr,
          publishFeeAmount,
          (await communityContract.communities(communityId)).publishNonce,
          sampleHash,
        ],
      };

      const [encodedData, signature] = await multisig(data, [
        community1Owner,
        signers[0],
      ]);

      const tx = await communityContract.publishProject(encodedData, signature);

      await expect(tx)
        .to.emit(communityContract, 'ProjectPublished')
        .withArgs(
          communityId,
          projectAddress,
          apr,

          publishFeeAmount,
          publishFeeAmount.gt(0) ? false : true,
          sampleHash,
        );

      const [
        projectApr,
        projectLendingNeeded,
        projectTotalLent,
        publishFee,
        publishFeePaid,
      ] = await communityContract.projectDetails(communityId, projectAddress);

      expect(projectApr).to.be.equal(apr);
      expect(projectLendingNeeded).to.be.equal(0);
      expect(projectTotalLent).to.be.equal(0);
      expect(publishFee).to.be.equal(publishFeeAmount);
      expect(publishFeePaid).to.be.equal(false);

      const { publishNonce } = await communityContract.communities(communityId);
      expect(publishNonce).to.equal(1);
    });
    it('should revert when unpublish if project has not been already published', async () => {
      await expect(
        communityContract.unpublishProject(2, etherProjectAddress),
      ).to.be.revertedWith('Community::!published');
    });
    it('should publish ether project', async () => {
      apr = 10;
      const communityId = 2;
      const data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          communityId,
          etherProjectAddress,
          apr,
          0,
          (await communityContract.communities(communityId)).publishNonce,
          sampleHash,
        ],
      };

      const [encodedData, signature] = await multisig(data, [
        community2Owner,
        signers[0],
      ]);
      let curCommunityID = await communityContract.projectPublished(
        etherProjectAddress,
      );
      expect(curCommunityID).to.equal(0);
      const tx = await communityContract.publishProject(encodedData, signature);

      await expect(tx)
        .to.emit(communityContract, 'ProjectPublished')
        .withArgs(communityId, etherProjectAddress, apr, 0, true, sampleHash);
      curCommunityID = await communityContract.projectPublished(
        etherProjectAddress,
      );
      expect(curCommunityID).to.equal(communityId);

      const [
        projectApr,
        projectLendingNeeded,
        projectTotalLent,
        publishFee,
        publishFeePaid,
      ] = await communityContract.projectDetails(
        communityId,
        etherProjectAddress,
      );

      expect(projectApr).to.be.equal(apr);
      expect(projectLendingNeeded).to.be.equal(0);
      expect(projectTotalLent).to.be.equal(0);
      expect(publishFee).to.be.equal(0);
      expect(publishFeePaid).to.be.equal(true);

      const { publishNonce } = await communityContract.communities(communityId);
      expect(publishNonce).to.equal(1);
    });
    it('should publish project after unpublish if project is already published', async () => {
      // use another community with native currency
      const communityId = 3;

      let curCommunityID = await communityContract.projectPublished(
        etherProjectAddress,
      );
      expect(curCommunityID).to.equal(2);

      let data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          communityId,
          etherProjectAddress,
          apr,
          0,
          (await communityContract.communities(communityId)).publishNonce,
          sampleHash,
        ],
      };

      let [encodedData, signature] = await multisig(data, [
        community3Owner,
        signers[0],
      ]);

      const tx = await communityContract.publishProject(encodedData, signature);
      await expect(tx)
        .to.emit(communityContract, 'ProjectPublished')
        .withArgs(communityId, etherProjectAddress, apr, 0, true, sampleHash);
      await expect(tx)
        .to.emit(communityContract, 'ProjectUnpublished')
        .withArgs(2, etherProjectAddress);
      curCommunityID = await communityContract.projectPublished(
        etherProjectAddress,
      );
      expect(curCommunityID).to.equal(communityId);
      // publish again to community 2
      data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          2,
          etherProjectAddress,
          apr,
          0,
          (await communityContract.communities(2)).publishNonce,
          sampleHash,
        ],
      };
      [encodedData, signature] = await multisig(data, [
        community2Owner,
        signers[0],
      ]);
      await communityContract.publishProject(encodedData, signature);
      curCommunityID = await communityContract.projectPublished(
        etherProjectAddress,
      );
      expect(curCommunityID).to.equal(2);
    });
  });

  describe('payPublishFee()', () => {
    it('should revert to toggle lendingNeeded before paying publish fee', async () => {
      const communityId = 1;

      await expect(
        communityContract.toggleLendingNeeded(communityId, project.address, 10),
      ).to.be.revertedWith('Community::publish fee !paid');
    });
    it('should be able to pay project publish fee', async () => {
      const communityId = 1;

      await mockDAIContract.mock.transferFrom
        .withArgs(
          signers[0].address,
          (
            await communityContract.communities(communityId)
          ).owner,
          publishFeeAmount,
        )
        .returns(true);

      const tx = await communityContract.payPublishFee(
        communityId,
        projectAddress,
      );

      await expect(tx)
        .to.emit(communityContract, 'PublishFeePaid')
        .withArgs(communityId, projectAddress);

      const [, , , publishFee, publishFeePaid] =
        await communityContract.projectDetails(communityId, projectAddress);

      expect(publishFee).to.be.equal(publishFeeAmount);
      expect(publishFeePaid).to.be.equal(true);
    });
    it('should revert when publish fee already paid', async () => {
      await expect(
        communityContract.payPublishFee(1, projectAddress),
      ).to.be.revertedWith('Community::publish fee paid');
    });
  });

  describe('toggleLendingNeeded() - part 1', () => {
    it('should be able to set lendingNeeded using toggle debt', async () => {
      // other tests related to toggle debt can be found later below
      lendingNeeded = (await project.projectCost()).div(2);
      etherLendingNeeded = await etherProject.projectCost();

      const communityId = 1;
      const etherCommunityId = 2;

      await communityContract.toggleLendingNeeded(
        communityId,
        project.address,
        lendingNeeded,
      );
      await communityContract.toggleLendingNeeded(
        etherCommunityId,
        etherProject.address,
        etherLendingNeeded,
      );

      const [, projectLendingNeeded] = await communityContract.projectDetails(
        communityId,
        project.address,
      );
      const [, etherProjectLendingNeeded] =
        await communityContract.projectDetails(
          etherCommunityId,
          etherProject.address,
        );

      expect(projectLendingNeeded).to.be.equal(lendingNeeded);
      expect(etherProjectLendingNeeded).to.be.equal(etherLendingNeeded);
    });
  });

  describe('lendToProject()', () => {
    it('should revert lent in project if project not in community', async () => {
      const tx = communityContract
        .connect(signers[2])
        .lendToProject(1, signers[0].address, 1000, sampleHash);
      await expect(tx).to.be.revertedWith('Community::!published');
    });
    it('should revert lent in project if lending too high', async () => {
      const tx = communityContract
        .connect(signers[2])
        .lendToProject(1, projectAddress, '9991000000000000', sampleHash);
      await expect(tx).to.be.revertedWith('Community::lending>needed');
    });
    it('should revert lent in project if not community owner', async () => {
      const tx = communityContract
        .connect(signers[0])
        .lendToProject(1, projectAddress, 1000000000, sampleHash);
      await expect(tx).to.be.revertedWith('Community::!owner');
    });
    // project-1
    it('should lent in project', async () => {
      const lender = signers[2].address;
      lendingPrincipal = 1020000000;
      lendingReturn = lendingPrincipal;
      lendingInterest = 0;
      const fee = (lendingPrincipal * lenderFee) / (lenderFee + 1000);
      const amountToProject = lendingPrincipal - fee;
      totalLent += amountToProject;

      await mockDAIContract.mock.transferFrom
        .withArgs(lender, treasury, fee)
        .returns(true);
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, projectAddress, amountToProject)
        .returns(true);
      const tx = await communityContract
        .connect(signers[2])
        .lendToProject(1, projectAddress, lendingPrincipal, sampleHash);
      const receipt = await tx.wait();
      const txBlock = await ethers.provider.getBlock(receipt.blockNumber);
      lendingTimestamp = txBlock.timestamp;

      // add lender lent
      await expect(tx)
        .to.emit(communityContract, 'LenderLent')
        .withArgs(
          1,
          projectAddress,
          signers[2].address,
          lendingPrincipal,
          sampleHash,
        );
      await expect(tx)
        .to.emit(project, 'LendToProject')
        .withArgs(amountToProject);
      await expect(tx).to.not.emit(communityContract, 'ClaimedInterest');

      const [
        projApr,
        projectLendingNeeded,
        projectTotalLent,
        ,
        ,
        lentAmount,
        interest,
        lastTimestamp,
      ] = await communityContract.projectDetails(1, projectAddress);
      expect(await rDAIContract.balanceOf(signers[2].address)).to.equal(
        lendingPrincipal,
      );
      expect(projApr).to.equal(apr);
      expect(projectLendingNeeded).to.be.equal(lendingNeeded);
      expect(projectTotalLent).to.be.equal(amountToProject);
      expect(lentAmount).to.be.equal(lendingPrincipal);
      expect(interest).to.be.equal(lendingInterest);
      expect(lastTimestamp).to.be.equal(lendingTimestamp);
    });
    it('should lent in ether project', async () => {
      const lender = signers[1].address;
      const lending = (10000 / 2) * 1.02;
      const fee = (lending * lenderFee) / (lenderFee + 1000);
      const amountToProject = lending - fee;

      await mockETHContract.mock.transferFrom
        .withArgs(lender, treasury, fee)
        .returns(true);
      await mockETHContract.mock.transferFrom
        .withArgs(lender, etherProjectAddress, amountToProject)
        .returns(true);

      const tx = await communityContract
        .connect(signers[1])
        .lendToProject(2, etherProjectAddress, lending, sampleHash);
      await tx.wait();
      expect(await rETHContract.balanceOf(signers[1].address)).to.equal(
        lending,
      );
      const members = await communityContract.members(2);
      const [, projectLendingNeeded, projectTotalLent] =
        await communityContract.projectDetails(2, etherProjectAddress);
      etherTotalLend += amountToProject;
      expect(projectLendingNeeded).to.be.equal(etherLendingNeeded);
      expect(projectTotalLent).to.be.equal(etherTotalLend);
      await expect(tx)
        .to.emit(communityContract, 'LenderLent')
        .withArgs(
          2,
          etherProjectAddress,
          signers[1].address,
          lending,
          sampleHash,
        );
      const projectBalance = await ethers.provider.getBalance(
        etherProjectAddress,
      );
      expect(projectBalance).to.equal(0);
    });
    it('should lent in ether project without msg.value', async () => {
      const lending = (10000 / 2) * 1.02;

      const fee = (lending * lenderFee) / (lenderFee + 1000);
      const amountToProject = lending - fee;

      await mockETHContract.mock.transferFrom
        .withArgs(signers[1].address, treasury, fee)
        .returns(true);
      await mockETHContract.mock.transferFrom
        .withArgs(signers[1].address, etherProjectAddress, amountToProject)
        .returns(true);

      const tx = await communityContract
        .connect(signers[1])
        .lendToProject(2, etherProjectAddress, lending, sampleHash);
      await expect(tx)
        .to.emit(communityContract, 'LenderLent')
        .withArgs(
          2,
          etherProjectAddress,
          signers[1].address,
          lending,
          sampleHash,
        );
    });
    it('should revert to lent more than lendingNeeded', async () => {
      const communityId = 1;
      const projectCost = await project.projectCost();
      const projectPublishedDebt = (
        await communityContract.projectDetails(communityId, project.address)
      )[2];
      expect(projectCost).to.be.gt(projectPublishedDebt);
      const tx = communityContract
        .connect(signers[2])
        .lendToProject(communityId, project.address, projectCost, '0x');
      await expect(tx).to.be.revertedWith('Community::lending>needed');
    });
    // project-1
    it('returnToLender(): should accrue interest', async () => {
      await mineBlock(lendingTimestamp + ONE_DAY);
      const numDays = 1;
      const totalInterest = Math.floor(
        (lendingPrincipal * apr * numDays) / 365000,
      );
      const amountToReturn = lendingPrincipal + totalInterest;
      const [
        _amountToReturn,
        _lendingPrincipal,
        _totalInterest,
        _unclaimedInterest,
      ] = await communityContract.returnToLender(1, projectAddress);
      expect(_lendingPrincipal).to.equal(lendingPrincipal);
      expect(_amountToReturn).to.equal(amountToReturn);
      expect(_totalInterest).to.equal(totalInterest);
      expect(_unclaimedInterest).to.equal(totalInterest);
    });
  });

  describe('toggleLendingNeeded() - part 2', () => {
    it('should revert toggle lendingNeeded when project is not published', async () => {
      const communityId = 1;
      const newLendingNeeded = await project.projectCost();

      await expect(
        communityContract.toggleLendingNeeded(
          communityId,
          signers[0].address,
          newLendingNeeded,
        ),
      ).to.be.revertedWith('Community::!published');
    });
    it('should revert toggle lendingNeeded when sender is not builder', async () => {
      const communityId = 1;
      const newLendingNeeded = await project.projectCost();

      await expect(
        communityContract
          .connect(signers[1])
          .toggleLendingNeeded(communityId, project.address, newLendingNeeded),
      ).to.be.revertedWith('Community::!Builder');
    });
    it('should revert toggle lendingNeeded when new lendingNeeded < what is already lent', async () => {
      const communityId = 1;
      const projectTotalLent = (
        await communityContract.projectDetails(communityId, project.address)
      )[2];

      await expect(
        communityContract.toggleLendingNeeded(
          communityId,
          project.address,
          projectTotalLent.sub(1),
        ),
      ).to.be.revertedWith('Community::invalid lending');
    });
    it('should revert toggle lendingNeeded when new lendingNeeded > project cost', async () => {
      const communityId = 1;
      const projectCost = await project.projectCost();

      await expect(
        communityContract.toggleLendingNeeded(
          communityId,
          project.address,
          projectCost.add(1),
        ),
      ).to.be.revertedWith('Community::invalid lending');
    });
    // project-1
    it('should be able to toggle lendingNeeded', async () => {
      const communityId = 1;
      const projectCost = await project.projectCost();

      // decrease
      let projectLendingNeeded = (
        await communityContract.projectDetails(communityId, project.address)
      )[1];
      let projectTotalLent = (
        await communityContract.projectDetails(communityId, project.address)
      )[2];
      expect(projectLendingNeeded).to.be.gt(projectTotalLent);

      let tx = await communityContract.toggleLendingNeeded(
        communityId,
        project.address,
        projectTotalLent,
      );
      await expect(tx)
        .to.emit(communityContract, 'ToggleLendingNeeded')
        .withArgs(communityId, project.address, projectTotalLent);

      let newProjectLendingNeeded = (
        await communityContract.projectDetails(communityId, project.address)
      )[1];
      let newProjectTotalLent = (
        await communityContract.projectDetails(communityId, project.address)
      )[2];
      expect(newProjectLendingNeeded).to.be.gte(newProjectTotalLent);
      expect(newProjectTotalLent).to.equal(projectTotalLent);
      expect(newProjectLendingNeeded).to.equal(projectTotalLent);

      // increase
      tx = await communityContract.toggleLendingNeeded(
        communityId,
        project.address,
        projectCost,
      );

      await expect(tx)
        .to.emit(communityContract, 'ToggleLendingNeeded')
        .withArgs(communityId, project.address, projectCost);

      newProjectLendingNeeded = (
        await communityContract.projectDetails(communityId, project.address)
      )[1];
      newProjectTotalLent = (
        await communityContract.projectDetails(communityId, project.address)
      )[2];
      expect(newProjectLendingNeeded).to.be.gte(newProjectTotalLent);
      expect(newProjectTotalLent).to.equal(projectTotalLent);
      expect(newProjectLendingNeeded).to.equal(projectCost);
      expect(projectCost).to.be.gt(projectTotalLent);

      lendingNeeded = projectCost;
    });
    it('should be able to lent due to the increased lendingNeeded', async () => {
      const communityId = 1;
      const lender = signers[2].address;
      const projectCost = await project.projectCost();
      const projectPublishedDebt = (
        await communityContract.projectDetails(communityId, project.address)
      )[1];

      expect(projectCost).to.be.eq(projectPublishedDebt);

      const fee = projectCost
        .mul(lenderFee)
        .div((await project.lenderFee()).add(1000));
      const amountToProject = projectCost.sub(fee).toNumber();
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, treasury, fee)
        .returns(true);
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, projectAddress, amountToProject)
        .returns(true);
      const tx = communityContract
        .connect(signers[2])
        .callStatic.lendToProject(
          communityId,
          project.address,
          projectCost,
          '0x',
        );
      await expect(tx).to.not.be.reverted;
      // lending project cost in next test
    });
  });

  describe('check accrued interest', () => {
    // project-1
    it('should accrue interest and lent in project', async () => {
      const numDays = 2;
      const lender = signers[2].address;
      const totalInterest = Math.floor(
        (lendingPrincipal * apr * numDays) / 365000,
      );
      expect(totalInterest).to.equal(55890); // outside calculation
      const amountToReturn = Math.floor(lendingPrincipal + totalInterest);
      const newLendingWithFee = (await project.projectCost()).sub(totalLent);
      const newLending = newLendingWithFee.mul(lenderFee + 1000).div(1000);
      const fee = newLending.mul(lenderFee).div(lenderFee + 1000);
      lendingPrincipal += newLending.toNumber();
      lendingInterest += totalInterest;
      lendingReturn = lendingPrincipal + totalInterest;
      totalLent += newLendingWithFee.toNumber();

      await mockDAIContract.mock.transferFrom
        .withArgs(lender, treasury, fee)
        .returns(true);
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, projectAddress, newLendingWithFee)
        .returns(true);

      await setNextBlockTimestamp(lendingTimestamp + 2 * ONE_DAY);
      const tx = await communityContract
        .connect(signers[2])
        .lendToProject(1, projectAddress, newLending, sampleHash);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'LenderLent')
        .withArgs(
          1,
          projectAddress,
          signers[2].address,
          newLending,
          sampleHash,
        );
      await expect(tx)
        .to.emit(communityContract, 'ClaimedInterest')
        .withArgs(1, projectAddress, signers[2].address, totalInterest);

      const txBlock = await ethers.provider.getBlock(receipt.blockNumber);
      const newLendingTimestamp = txBlock.timestamp;
      lendingTimestamp = newLendingTimestamp;

      expect(await rDAIContract.balanceOf(signers[2].address)).to.equal(
        newLending.add(amountToReturn),
      );
      // additional checks
      const [
        _amountToReturn,
        _lendingPrincipal,
        _totalInterest,
        _unclaimedInterest,
      ] = await communityContract.returnToLender(1, projectAddress);
      expect(_lendingPrincipal).to.equal(lendingPrincipal);
      expect(_amountToReturn).to.equal(lendingReturn);
      expect(_totalInterest).to.equal(totalInterest);
      expect(_unclaimedInterest).to.equal(0);

      const [
        ,
        _projectLendingNeeded,
        _projectTotalLent,
        ,
        ,
        _lentAmount,
        _interest,
        _lastTimestamp,
      ] = await communityContract.projectDetails(1, projectAddress);
      expect(_projectLendingNeeded).to.be.equal(lendingNeeded);
      expect(_projectTotalLent).to.be.equal(totalLent).to.equal(lendingNeeded);
      expect(_lentAmount).to.be.equal(lendingPrincipal);
      expect(_interest).to.be.equal(lendingInterest);
      expect(_lastTimestamp).to.be.equal(lendingTimestamp);
    });
  });

  describe('unpublishProject()', () => {
    it('should revert unpublish when not called by builder', async () => {
      const communityId = 1;
      const tx = communityContract
        .connect(signers[1]) // not builder
        .unpublishProject(communityId, project.address);

      await expect(tx).to.be.revertedWith('Community::!Builder');
    });
    it('should be able to unpublish', async () => {
      const communityId = 2;
      const oldLendingNeeded = (
        await communityContract.projectDetails(
          communityId,
          etherProject.address,
        )
      )[1];
      expect(oldLendingNeeded).to.equal(await etherProject.projectCost());
      const totalLent = (
        await communityContract.projectDetails(
          communityId,
          etherProject.address,
        )
      )[2];

      const tx = await communityContract
        .connect(signers[0])
        .unpublishProject(communityId, etherProject.address);

      await expect(tx)
        .to.emit(communityContract, 'ProjectUnpublished')
        .withArgs(communityId, etherProject.address);

      const newLendingNeeded = (
        await communityContract.projectDetails(
          communityId,
          etherProject.address,
        )
      )[1];
      expect(newLendingNeeded).to.equal(totalLent); // as lendingNeeded will be equal to totalLent after unpublish
    });
    it('should revert to lent after unpublish', async () => {
      const communityId = 2;
      await expect(
        communityContract
          .connect(signers[1])
          .lendToProject(communityId, project.address, 1, '0x'),
      ).to.be.revertedWith('Community::!published');
    });
  });

  describe('repayLender()', () => {
    it('should revert when repay amount is greater than required to return or if project not in community', async () => {
      const tx = communityContract
        .connect(signers[0])
        .repayLender(1, etherProjectAddress, 1000);
      await expect(tx).to.be.revertedWith('Community::!Liquid');
    });
    it('should revert if not builder', async () => {
      const tx = communityContract
        .connect(signers[2])
        .repayLender(1, projectAddress, 1000);
      await expect(tx).to.be.revertedWith('Community::!Builder');
    });
    it('should revert reduce debt if repayment not started', async () => {
      const tx = communityContract
        .connect(signers[2])
        .callStatic.reduceDebt(1, projectAddress, 1000, '0x');
      await expect(tx).to.not.be.revertedWith('Community::Repayment !started');
    });
    it('should revert if repayment not started', async () => {
      const tx = communityContract
        .connect(signers[0])
        .callStatic.repayLender(1, projectAddress, 1000);
      await expect(tx).to.not.be.revertedWith('Community::Repayment !started');
    });
    it('should revert if amount exceeds', async () => {
      const tx = communityContract
        .connect(signers[0])
        .repayLender(1, projectAddress, 2 * lendingReturn);
      await expect(tx).to.be.revertedWith('Community::!Liquid');
    });
    // project-1
    it('should be able to repay lender, repay less than total interest', async () => {
      const increaseTimeTo = (await currentTimestamp()) + 720000;
      const numDays = Math.floor((increaseTimeTo - lendingTimestamp) / ONE_DAY);
      expect(numDays).to.equal(8);
      const lender = signers[2].address;
      const newAccumulatedInterest = Math.floor(
        (lendingPrincipal * apr * numDays) / 365000,
      );
      const totalInterest = lendingInterest + newAccumulatedInterest;
      const amountToReturn = lendingPrincipal + totalInterest;
      expect(newAccumulatedInterest).to.equal(67068493); // outside calculation
      expect(totalInterest).to.equal(67124383); // outside calculation

      const repayAmount = totalInterest - 1;

      await mockDAIContract.mock.transferFrom
        .withArgs(signers[0].address, lender, repayAmount)
        .returns(true);

      await setNextBlockTimestamp(increaseTimeTo);
      const tx = await communityContract
        .connect(signers[0])
        .repayLender(1, projectAddress, repayAmount);

      await expect(tx)
        .to.emit(communityContract, 'RepayLender')
        .withArgs(1, projectAddress, lender, repayAmount);

      // repayAmount should be reduced from totalInterest and not from principal as repay < totalInterest
      lendingInterest = totalInterest - repayAmount;
      lendingReturn = amountToReturn - repayAmount;
      lendingTimestamp = increaseTimeTo;

      expect(await rDAIContract.balanceOf(signers[2].address)).to.equal(
        lendingReturn,
      );

      // additional checks
      const [
        _amountToReturn,
        _lendingPrincipal,
        _totalInterest,
        _unclaimedInterest,
      ] = await communityContract.returnToLender(1, projectAddress);
      expect(_amountToReturn).to.equal(lendingReturn);
      expect(_lendingPrincipal).to.equal(lendingPrincipal);
      expect(_totalInterest).to.equal(lendingInterest).to.equal(1);
      expect(_unclaimedInterest).to.equal(0);

      const [
        ,
        ,
        _projectTotalLent,
        ,
        ,
        _lentAmount,
        _interest,
        _lastTimestamp,
      ] = await communityContract.projectDetails(1, projectAddress);
      expect(_projectTotalLent).to.be.equal(totalLent);
      expect(_lentAmount).to.be.equal(lendingPrincipal);
      expect(_interest).to.be.equal(lendingInterest);
      expect(_lastTimestamp).to.be.equal(lendingTimestamp);
    });
    it('should be able to repay lender in ether', async () => {
      const lender = signers[1].address;
      const repayAmount = 1000;

      await mockETHContract.mock.transferFrom
        .withArgs(signers[0].address, lender, repayAmount)
        .returns(true);

      const balance = await ethers.provider.getBalance(lender);

      const tx = await communityContract
        .connect(signers[0])
        .repayLender(2, etherProjectAddress, repayAmount);

      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'RepayLender')
        .withArgs(2, etherProjectAddress, lender, repayAmount);
      const newBalance = await ethers.provider.getBalance(lender);
      const projectBalance = await ethers.provider.getBalance(
        etherProjectAddress,
      );
      expect(newBalance).to.equal(balance); // as we are using wrapped native currency
      expect(projectBalance).to.equal(0); // as we are using wrapped native currency
    });
    // project-1
    it('should be able to repay lender again, repay equal to total interest', async () => {
      const increaseTimeTo = (await currentTimestamp()) + 720000;
      const numDays = Math.floor((increaseTimeTo - lendingTimestamp) / ONE_DAY);
      expect(numDays).to.equal(8);
      const lender = signers[2].address;
      const newAccumulatedInterest = Math.floor(
        (lendingPrincipal * apr * numDays) / 365000,
      );
      const totalInterest = lendingInterest + newAccumulatedInterest;
      const amountToReturn = lendingPrincipal + totalInterest;
      expect(newAccumulatedInterest).to.equal(67068493); // outside calculation
      expect(totalInterest).to.equal(67068494); // outside calculation

      const repayAmount = totalInterest;

      await mockDAIContract.mock.transferFrom
        .withArgs(signers[0].address, lender, repayAmount)
        .returns(true);

      await setNextBlockTimestamp(increaseTimeTo);
      const tx = await communityContract
        .connect(signers[0])
        .repayLender(1, projectAddress, repayAmount);

      await expect(tx)
        .to.emit(communityContract, 'RepayLender')
        .withArgs(1, projectAddress, lender, repayAmount);

      // repayAmount should be reduced from totalInterest and not from principal as repay < totalInterest
      lendingInterest = totalInterest - repayAmount;
      lendingReturn = amountToReturn - repayAmount;
      lendingTimestamp = increaseTimeTo;

      expect(await rDAIContract.balanceOf(signers[2].address)).to.equal(
        lendingReturn,
      );

      // additional checks
      const [
        _amountToReturn,
        _lendingPrincipal,
        _totalInterest,
        _unclaimedInterest,
      ] = await communityContract.returnToLender(1, projectAddress);
      expect(_amountToReturn).to.equal(lendingReturn);
      expect(_lendingPrincipal).to.equal(lendingPrincipal);
      expect(_totalInterest).to.equal(lendingInterest).to.equal(0);
      expect(_unclaimedInterest).to.equal(0);

      const [
        ,
        ,
        _projectTotalLent,
        ,
        ,
        _lentAmount,
        _interest,
        _lastTimestamp,
      ] = await communityContract.projectDetails(1, projectAddress);
      expect(_projectTotalLent).to.be.equal(totalLent);
      expect(_lentAmount).to.be.equal(lendingPrincipal);
      expect(_interest).to.be.equal(lendingInterest);
      expect(_lastTimestamp).to.be.equal(lendingTimestamp);
    });
    // project-1
    it('should be able to repay lender again, repay greater than totalInterest', async () => {
      const increaseTimeTo = (await currentTimestamp()) + 720000;
      const numDays = Math.floor((increaseTimeTo - lendingTimestamp) / ONE_DAY);
      expect(numDays).to.equal(8);
      const lender = signers[2].address;
      const newAccumulatedInterest = Math.floor(
        (lendingPrincipal * apr * numDays) / 365000,
      );
      const totalInterest = lendingInterest + newAccumulatedInterest;
      expect(newAccumulatedInterest).to.equal(67068493); // outside calculation
      expect(totalInterest).to.equal(67068493); // outside calculation

      const repayAmount = totalInterest + lendingPrincipal / 2;
      expect(repayAmount).to.equal(153067068493); // outside calculation

      await mockDAIContract.mock.transferFrom
        .withArgs(signers[0].address, lender, repayAmount)
        .returns(true);

      await setNextBlockTimestamp(increaseTimeTo);
      const tx = await communityContract
        .connect(signers[0])
        .repayLender(1, projectAddress, repayAmount);

      await expect(tx)
        .to.emit(communityContract, 'RepayLender')
        .withArgs(1, projectAddress, lender, repayAmount);

      lendingPrincipal = lendingPrincipal + totalInterest - repayAmount;
      lendingInterest = 0;
      lendingReturn = lendingPrincipal;
      lendingTimestamp = increaseTimeTo;
      expect(lendingPrincipal).to.equal(153000000000); // outside calculation

      expect(await rDAIContract.balanceOf(signers[2].address)).to.equal(
        lendingReturn,
      );

      // additional checks
      const [
        _amountToReturn,
        _lendingPrincipal,
        _totalInterest,
        _unclaimedInterest,
      ] = await communityContract.returnToLender(1, projectAddress);
      expect(_amountToReturn).to.equal(lendingReturn);
      expect(_lendingPrincipal).to.equal(lendingPrincipal);
      expect(_totalInterest).to.equal(lendingInterest);
      expect(_unclaimedInterest).to.equal(0);

      const [
        ,
        ,
        _projectTotalLent,
        ,
        ,
        _lentAmount,
        _interest,
        _lastTimestamp,
      ] = await communityContract.projectDetails(1, projectAddress);
      expect(_projectTotalLent).to.be.equal(totalLent);
      expect(_lentAmount).to.be.equal(lendingPrincipal);
      expect(_interest).to.be.equal(lendingInterest);
      expect(_lastTimestamp).to.be.equal(lendingTimestamp);
    });
  });

  describe('reduceDebt()', () => {
    it('should revert if invalid project', async () => {
      const tx = communityContract
        .connect(signers[2])
        .reduceDebt(1, constants.AddressZero, 1000, '0x');
      await expect(tx).to.be.revertedWith('Community::!Liquid');
    });
    it('should revert if amount too great', async () => {
      const amountToReturn = (
        await communityContract.returnToLender(1, projectAddress)
      )[0];
      const tx = communityContract
        .connect(signers[2])
        .reduceDebt(1, projectAddress, amountToReturn.add(1), '0x');
      await expect(tx).to.be.revertedWith('Community::!Liquid');
    });
    it('should be able to reduce debt', async () => {
      const debtToReduce = BigNumber.from(1000);
      const [returnBefore] = await communityContract.returnToLender(
        1,
        projectAddress,
      );
      const tx = await communityContract
        .connect(signers[2])
        .reduceDebt(1, projectAddress, debtToReduce, '0x0a18');

      expect(tx)
        .to.emit(communityContract, 'DebtReduced')
        .withArgs(
          1,
          projectAddress,
          signers[2].address,
          debtToReduce,
          '0x0a18',
        );

      const [returnAfter] = await communityContract.returnToLender(
        1,
        projectAddress,
      );
      expect(returnBefore.sub(returnAfter)).to.equal(debtToReduce);

      lendingPrincipal = lendingPrincipal - Number(debtToReduce);
      lendingReturn = lendingPrincipal;
      expect(lendingPrincipal).to.equal(152999999000); // outside calculation

      expect(await rDAIContract.balanceOf(signers[2].address)).to.equal(
        lendingReturn,
      );

      // additional checks
      const [
        _amountToReturn,
        _lendingPrincipal,
        _totalInterest,
        _unclaimedInterest,
      ] = await communityContract.returnToLender(1, projectAddress);
      expect(_amountToReturn).to.equal(lendingReturn);
      expect(_lendingPrincipal).to.equal(lendingPrincipal);
      expect(_totalInterest).to.equal(lendingInterest);
      expect(_unclaimedInterest).to.equal(0);

      const [
        ,
        ,
        _projectTotalLent,
        ,
        ,
        _lentAmount,
        _interest,
        _lastTimestamp,
      ] = await communityContract.projectDetails(1, projectAddress);
      expect(_projectTotalLent).to.be.equal(totalLent);
      expect(_lentAmount).to.be.equal(lendingPrincipal);
      expect(_interest).to.be.equal(lendingInterest);
      expect(_lastTimestamp).to.be.equal(lendingTimestamp);
    });
    it('should revert if no debt to be repaid or when try to reply with 0 amount', async () => {
      const tx = communityContract
        .connect(signers[2])
        .reduceDebt(1, projectAddress, 0, '0x0a18');

      await expect(tx).to.be.revertedWith('Community::!repay');
    });
    it('should be able to reduce full debt', async () => {
      const data = await communityContract.returnToLender(1, projectAddress);
      expect(data[0]).to.equal(152999999000); // outside calculation
      const tx = await communityContract
        .connect(signers[2])
        .reduceDebt(1, projectAddress, data[0], '0x0a18');

      expect(tx)
        .to.emit(communityContract, 'DebtReduced')
        .withArgs(1, projectAddress, signers[2].address, data[0], '0x0a18');

      const dataAfter = await communityContract.returnToLender(
        1,
        projectAddress,
      );
      expect(dataAfter[0]).to.equal(0);

      // additional checks
      lendingPrincipal = 0;
      lendingReturn = lendingPrincipal;
      const [
        _amountToReturn,
        _lendingPrincipal,
        _totalInterest,
        _unclaimedInterest,
      ] = await communityContract.returnToLender(1, projectAddress);
      expect(_amountToReturn).to.equal(lendingReturn);
      expect(_lendingPrincipal).to.equal(lendingPrincipal);
      expect(_totalInterest).to.equal(lendingInterest);
      expect(_unclaimedInterest).to.equal(0);

      const [
        ,
        ,
        _projectTotalLent,
        ,
        ,
        _lentAmount,
        _interest,
        _lastTimestamp,
      ] = await communityContract.projectDetails(1, projectAddress);
      expect(_projectTotalLent).to.be.equal(totalLent);
      expect(_lentAmount).to.be.equal(lendingPrincipal);
      expect(_interest).to.be.equal(lendingInterest);
      expect(_lastTimestamp).to.be.equal(lendingTimestamp);
    });
  });

  describe('Other tests', () => {
    // Tests related to commented transferDebt
    // it('should revert transferDebt if transferDebtLock is true', async () => { expect(await communityContract.transferDebtLock()).to.be.true; const tx = communityContract .connect(signers[2]) .transferDebt(1, projectAddress, signers[1].address, 1000); await expect(tx).to.be.revertedWith('Community::locked'); await communityContract.unlockTransferDebt(); }); it('should revert transferDebt if not valid project', async () => { const lender = signers[2].address; const tx = communityContract .connect(signers[1]) .transferDebt(1, signers[1].address, lender, 0); await expect(tx).to.be.revertedWith('Community::Claim||!lent'); }); it('should revert transferDebt if no lending', async () => { const lender = signers[2].address; const tx = communityContract .connect(signers[1]) .transferDebt(1, projectAddress, lender, 0); await expect(tx).to.be.revertedWith('Community::Claim||!lent'); }); it('should revert transferDebt if amount 0', async () => { const tx = communityContract .connect(signers[2]) .transferDebt(1, projectAddress, signers[1].address, 0); await expect(tx).to.be.revertedWith('Community::!Balance'); }); it('should revert transfer lent if to not member', async () => { const tx = communityContract .connect(signers[2]) .transferDebt(1, projectAddress, signers[4].address, 1000); await expect(tx).to.be.revertedWith('Community::!Member'); }); it('should transfer lent via debt token transfer', async () => { const lender = signers[2].address; const tx = await communityContract .connect(signers[2]) .transferDebt(1, projectAddress, signers[1].address, 1000); await expect(tx) .to.emit(communityContract, 'DebtTransferred') .withArgs(1, projectAddress, lender, signers[1].address, 1000); await expect(tx) .to.emit(rDAIContract, 'Transfer') .withArgs(lender, signers[1].address, 1000); }); it('should transfer lent via debt token transfer and claim interest', async () => { const lender = signers[1].address; const tx = await communityContract .connect(signers[1]) .transferDebt(1, projectAddress, signers[2].address, 500); await expect(tx) .to.emit(communityContract, 'DebtTransferred') .withArgs(1, projectAddress, lender, signers[2].address, 500); await expect(tx) .to.emit(rDAIContract, 'Transfer') .withArgs(lender, signers[2].address, 500); });

    let newCommunityID = 0;
    let amountToProject: number;
    it('setup community, add project and make lending', async () => {
      const randomHash = '0x0a19';
      const count = (await communityContract.communityCount()).toNumber();
      await communityContract
        .connect(signers[2])
        .createCommunity(randomHash, tokenCurrency1);
      newCommunityID = count + 1;
      expect(await communityContract.communityCount()).to.equal(newCommunityID);
      const members = [signers[0], signers[1]];
      for (let i = 0; i < members.length; i++) {
        const data = {
          types: ['uint256', 'address', 'bytes'],
          values: [newCommunityID, members[i].address, sampleHash],
        };
        const [encodedData, signature] = await multisig(data, [
          signers[2],
          members[i],
        ]);
        await communityContract.addMember(encodedData, signature);
      }

      const _lendingNeeded = (await project2.projectCost()).toNumber();
      apr = 10;

      const data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          newCommunityID,
          project2.address,
          apr,
          0,
          (await communityContract.communities(newCommunityID)).publishNonce,
          sampleHash,
        ],
      };

      const [encodedData, signature] = await multisig(data, [
        community1Owner,
        signers[0],
      ]);

      await communityContract.publishProject(encodedData, signature);

      await communityContract.toggleLendingNeeded(
        newCommunityID,
        project2.address,
        _lendingNeeded,
      );

      const lender = signers[2].address;

      lendingPrincipal = 1020000000;
      const fee = (lendingPrincipal * lenderFee) / (lenderFee + 1000);
      amountToProject = lendingPrincipal - fee;
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, treasury, fee)
        .returns(true);
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, project2.address, amountToProject)
        .returns(true);

      const receipt = await (
        await communityContract
          .connect(signers[2])
          .lendToProject(
            newCommunityID,
            project2.address,
            lendingPrincipal,
            sampleHash,
          )
      ).wait();
      const txBlock = await ethers.provider.getBlock(receipt.blockNumber);
      lendingTimestamp = txBlock.timestamp;
    });
    it('check lending', async () => {
      await ethers.provider.send('evm_setNextBlockTimestamp', [
        lendingTimestamp + ONE_DAY,
      ]);
      await ethers.provider.send('evm_mine', []);
      const numDays = 1;
      const lender = signers[2].address;
      const amountToReturn = Math.floor(
        lendingPrincipal +
          Math.floor((lendingPrincipal * apr * numDays) / 365000),
      );
      const [amountToReturnFromContract, lendAmountFromContract] =
        await communityContract.returnToLender(
          newCommunityID,
          project2.address,
        );
      expect(lendAmountFromContract).to.equal(lendingPrincipal);
      expect(amountToReturnFromContract).to.equal(amountToReturn);
      await ethers.provider.send('evm_mine', []);
    });
    it('should revert escrow with invalid builder', async () => {
      const lenderSigner = signers[2];
      const agentSigner = signers[3];
      const builderSigner = signers[1];
      const randomHash = '0x0a19';

      const [amountToReturnFromContract, lendAmountFromContract] =
        await communityContract.returnToLender(
          newCommunityID,
          project2.address,
        );
      const debtToReduce =
        amountToReturnFromContract.toNumber() -
        lendAmountFromContract.toNumber();
      const data = {
        types: [
          'uint256',
          'address',
          'address',
          'address',
          'address',
          'uint256',
          'bytes',
        ],
        values: [
          newCommunityID,
          builderSigner.address,
          lenderSigner.address,
          agentSigner.address,
          project2.address,
          debtToReduce,
          randomHash,
        ],
      };
      const [encodedData, signature] = await multisig(data, [
        builderSigner,
        lenderSigner,
        agentSigner,
      ]);

      const tx = communityContract.escrow(encodedData, signature);
      await expect(tx).to.be.revertedWith('Community::!Builder');
    });
    it('should revert escrow with invalid community owner (lender)', async () => {
      const lenderSigner = signers[1];
      const agentSigner = signers[3];
      const builderSigner = signers[0];
      const randomHash = '0x0a19';

      const [amountToReturnFromContract, lendAmountFromContract] =
        await communityContract.returnToLender(
          newCommunityID,
          project2.address,
        );
      const debtToReduce =
        amountToReturnFromContract.toNumber() -
        lendAmountFromContract.toNumber();
      const data = {
        types: [
          'uint256',
          'address',
          'address',
          'address',
          'address',
          'uint256',
          'bytes',
        ],
        values: [
          newCommunityID,
          builderSigner.address,
          lenderSigner.address,
          agentSigner.address,
          project2.address,
          debtToReduce,
          randomHash,
        ],
      };
      const [encodedData, signature] = await multisig(data, [
        builderSigner,
        lenderSigner,
        agentSigner,
      ]);

      const tx = communityContract.escrow(encodedData, signature);
      await expect(tx).to.be.revertedWith('Community::!Owner');
    });
    it('should revert escrow with invalid signatures', async () => {
      const lenderSigner = signers[2];
      const agentSigner = signers[3];
      const builderSigner = signers[0];
      const randomHash = '0x0a19';

      const [amountToReturnFromContract, lendAmountFromContract] =
        await communityContract.returnToLender(
          newCommunityID,
          project2.address,
        );
      const debtToReduce =
        amountToReturnFromContract.toNumber() -
        lendAmountFromContract.toNumber();

      const wrongCombinations = [
        [lenderSigner, lenderSigner, lenderSigner],
        [lenderSigner, lenderSigner, agentSigner],
        [lenderSigner, agentSigner, lenderSigner],
        [agentSigner, lenderSigner, lenderSigner],

        [lenderSigner, lenderSigner, lenderSigner],
        [lenderSigner, lenderSigner, builderSigner],
        [lenderSigner, builderSigner, lenderSigner],
        [builderSigner, lenderSigner, lenderSigner],

        [agentSigner, agentSigner, agentSigner],
        [agentSigner, agentSigner, lenderSigner],
        [agentSigner, lenderSigner, agentSigner],
        [lenderSigner, agentSigner, agentSigner],

        [agentSigner, agentSigner, agentSigner],
        [agentSigner, agentSigner, builderSigner],
        [agentSigner, builderSigner, agentSigner],
        [builderSigner, agentSigner, agentSigner],

        [builderSigner, builderSigner, builderSigner],
        [builderSigner, builderSigner, lenderSigner],
        [builderSigner, lenderSigner, builderSigner],
        [lenderSigner, builderSigner, builderSigner],

        [builderSigner, builderSigner, builderSigner],
        [builderSigner, builderSigner, agentSigner],
        [builderSigner, agentSigner, builderSigner],
        [agentSigner, builderSigner, builderSigner],
      ];
      for (let i = 0; i < wrongCombinations.length; i++) {
        const data = {
          types: [
            'uint256',
            'address',
            'address',
            'address',
            'address',
            'uint256',
            'bytes',
          ],
          values: [
            newCommunityID,
            builderSigner.address,
            lenderSigner.address,
            agentSigner.address,
            project2.address,
            debtToReduce,
            randomHash,
          ],
        };
        const [encodedData, signature] = await multisig(
          data,
          wrongCombinations[i],
        );

        const tx = communityContract.escrow(encodedData, signature);
        await expect(tx).to.be.revertedWith('Community::invalid signature');
      }
    });
    it('should be able to reduce debt using escrow', async () => {
      const lenderSigner = signers[2];
      const agentSigner = signers[3];
      const builderSigner = signers[0];
      const randomHash = '0x0a19';

      const [amountToReturnFromContract, lendAmountFromContract] =
        await communityContract.returnToLender(
          newCommunityID,
          project2.address,
        );
      const debtToReduce =
        amountToReturnFromContract.toNumber() -
        lendAmountFromContract.toNumber();
      const data = {
        types: [
          'uint256',
          'address',
          'address',
          'address',
          'address',
          'uint256',
          'bytes',
        ],
        values: [
          newCommunityID,
          builderSigner.address,
          lenderSigner.address,
          agentSigner.address,
          project2.address,
          debtToReduce,
          randomHash,
        ],
      };
      const [encodedData, signature] = await multisig(data, [
        lenderSigner,
        builderSigner,
        agentSigner,
      ]);

      const tx = await communityContract.escrow(encodedData, signature);
      await tx.wait();

      expect(tx)
        .to.emit(communityContract, 'DebtReduced')
        .withArgs(
          newCommunityID,
          project2.address,
          lenderSigner.address,
          debtToReduce,
          randomHash,
        );
      expect(tx)
        .to.emit(communityContract, 'DebtReducedByEscrow')
        .withArgs(agentSigner.address);

      const [returnAfter] = await communityContract.returnToLender(
        newCommunityID,
        project2.address,
      );
      expect(amountToReturnFromContract.sub(returnAfter)).to.equal(
        debtToReduce,
      );
    });
    it('should have msg.value to be 0', async () => {
      const projectBalance = await ethers.provider.getBalance(projectAddress);
      const etherProjectBalance = await ethers.provider.getBalance(
        etherProjectAddress,
      );
      expect(projectBalance).to.equal(0); // as we are using wrapped native currency
      expect(etherProjectBalance).to.equal(0); // as we are using wrapped native currency
    });
  });

  describe('two communities same owner tests', () => {
    // Tests related to commented transferDebt
    // it('should revert transferDebt if transferDebtLock is true', async () => { expect(await communityContract.transferDebtLock()).to.be.true; const tx = communityContract .connect(signers[2]) .transferDebt(1, projectAddress, signers[1].address, 1000); await expect(tx).to.be.revertedWith('Community::locked'); await communityContract.unlockTransferDebt(); }); it('should revert transferDebt if not valid project', async () => { const lender = signers[2].address; const tx = communityContract .connect(signers[1]) .transferDebt(1, signers[1].address, lender, 0); await expect(tx).to.be.revertedWith('Community::Claim||!lent'); }); it('should revert transferDebt if no lending', async () => { const lender = signers[2].address; const tx = communityContract .connect(signers[1]) .transferDebt(1, projectAddress, lender, 0); await expect(tx).to.be.revertedWith('Community::Claim||!lent'); }); it('should revert transferDebt if amount 0', async () => { const tx = communityContract .connect(signers[2]) .transferDebt(1, projectAddress, signers[1].address, 0); await expect(tx).to.be.revertedWith('Community::!Balance'); }); it('should revert transfer lent if to not member', async () => { const tx = communityContract .connect(signers[2]) .transferDebt(1, projectAddress, signers[4].address, 1000); await expect(tx).to.be.revertedWith('Community::!Member'); }); it('should transfer lent via debt token transfer', async () => { const lender = signers[2].address; const tx = await communityContract .connect(signers[2]) .transferDebt(1, projectAddress, signers[1].address, 1000); await expect(tx) .to.emit(communityContract, 'DebtTransferred') .withArgs(1, projectAddress, lender, signers[1].address, 1000); await expect(tx) .to.emit(hDAIContract, 'Transfer') .withArgs(lender, signers[1].address, 1000); }); it('should transfer lent via debt token transfer and claim interest', async () => { const lender = signers[1].address; const tx = await communityContract .connect(signers[1]) .transferDebt(1, projectAddress, signers[2].address, 500); await expect(tx) .to.emit(communityContract, 'DebtTransferred') .withArgs(1, projectAddress, lender, signers[2].address, 500); await expect(tx) .to.emit(hDAIContract, 'Transfer') .withArgs(lender, signers[2].address, 500); });
    let newProject1: Project;
    let newProject2: Project;
    let newCommunityID1 = 0;
    let newCommunityID2 = 0;
    let amountToProject: number;
    it('setup two communities, add project and make lending', async () => {
      // builder  = signers[0] contractor = signers[1]
      ({ projectContractInstance: newProject1 } = await createProject(
        homeFiContract,
        tasksLibrary.address,
        '0x',
        await homeFiContract.tokenCurrency1(),
      ));
      //create a community
      const randomHash = '0x0a19';
      let count = (await communityContract.communityCount()).toNumber();
      await communityContract
        .connect(signers[2])
        .createCommunity(randomHash, tokenCurrency1);
      newCommunityID1 = count + 1;
      expect(await communityContract.communityCount()).to.equal(
        newCommunityID1,
      );
      const members = [signers[0], signers[1]];
      // add builder and contractor as community members
      for (let i = 0; i < members.length; i++) {
        const data = {
          types: ['uint256', 'address', 'bytes'],
          values: [newCommunityID1, members[i].address, sampleHash],
        };
        const [encodedData, signature] = await multisig(data, [
          signers[2],
          members[i],
        ]);
        await communityContract.addMember(encodedData, signature);
      }
      let _lendingNeeded = (await newProject1.projectCost()).toNumber();
      apr = 10;

      let data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          newCommunityID1,
          newProject1.address,
          apr,
          0,
          (await communityContract.communities(newCommunityID1)).publishNonce,
          sampleHash,
        ],
      };

      let [encodedData, signature] = await multisig(data, [
        community1Owner,
        signers[0],
      ]);
      // publish project1 to Community1
      await expect(
        communityContract.publishProject(encodedData, signature),
      ).to.emit(communityContract, 'ProjectPublished');

      // community1 ask for lending for project 1
      await communityContract.toggleLendingNeeded(
        newCommunityID1,
        newProject1.address,
        _lendingNeeded,
      );
      // community owner is the lender
      let lender = signers[2].address;
      lendingPrincipal = 1020000000;
      const prjctLenderFee = (await newProject1.lenderFee()).toNumber();
      let fee = Number(
        ((lendingPrincipal * prjctLenderFee) / (prjctLenderFee + 1000)).toFixed(
          0,
        ),
      );
      amountToProject = lendingPrincipal - fee;

      // setup dai mocks for lending
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, treasury, fee)
        .returns(true);
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, newProject1.address, amountToProject)
        .returns(true);
      // lend to project1 through community 1
      let receipt = await (
        await communityContract
          .connect(signers[2])
          .lendToProject(
            newCommunityID1,
            newProject1.address,
            lendingPrincipal,
            sampleHash,
          )
      ).wait();
      // create another project with the same currency
      // builder  = signers[0] contractor = signers[1]
      ({ projectContractInstance: newProject2 } = await createProject(
        homeFiContract,
        tasksLibrary.address,
        '0x',
        await homeFiContract.tokenCurrency1(),
      ));
      //create a community with another owner
      count = (await communityContract.communityCount()).toNumber();
      await communityContract
        .connect(signers[3])
        .createCommunity(randomHash, tokenCurrency1);
      newCommunityID2 = count + 1;
      expect(await communityContract.communityCount()).to.equal(
        newCommunityID2,
      );
      // add builder and contractor as community members
      for (let i = 0; i < members.length; i++) {
        const data = {
          types: ['uint256', 'address', 'bytes'],
          values: [newCommunityID2, members[i].address, sampleHash],
        };
        const [encodedData, signature] = await multisig(data, [
          signers[3],
          members[i],
        ]);
        await communityContract.addMember(encodedData, signature);
      }
      _lendingNeeded = (await newProject2.projectCost()).toNumber();
      apr = 5;

      data = {
        types: ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes'],
        values: [
          newCommunityID2,
          newProject2.address,
          apr,
          0,
          (await communityContract.communities(newCommunityID2)).publishNonce,
          sampleHash,
        ],
      };
      [encodedData, signature] = await multisig(data, [signers[3], signers[0]]);
      // publish project2 to Community2
      await expect(
        communityContract.publishProject(encodedData, signature),
      ).to.emit(communityContract, 'ProjectPublished');
      // community1 ask for lending for project 1
      await communityContract.toggleLendingNeeded(
        newCommunityID2,
        newProject2.address,
        _lendingNeeded,
      );
      // community owner is the lender
      lender = signers[3].address;

      lendingPrincipal = 1020000000;
      const prjct2LenderFee = (await newProject2.lenderFee()).toNumber();
      fee = Number(
        (
          (lendingPrincipal * prjct2LenderFee) /
          (prjct2LenderFee + 1000)
        ).toFixed(0),
      );
      amountToProject = lendingPrincipal - fee;
      // setup dai mocks for lending
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, treasury, fee)
        .returns(true);
      await mockDAIContract.mock.transferFrom
        .withArgs(lender, newProject2.address, amountToProject)
        .returns(true);

      // lend to project2 through community 2
      receipt = await (
        await communityContract
          .connect(signers[3])
          .lendToProject(
            newCommunityID2,
            newProject2.address,
            lendingPrincipal,
            sampleHash,
          )
      ).wait();
      const txBlock = await ethers.provider.getBlock(receipt.blockNumber);
      lendingTimestamp = txBlock.timestamp;

      await ethers.provider.send('evm_mine', [
        lendingTimestamp + ONE_DAY * 365,
      ]);
    });
    it('should be able to reduce debt using escrow', async () => {
      const lenderCommunity1 = signers[2];
      const lenderCommunity2 = signers[3];
      const nobody = signers[9];
      const builderSigner = signers[0];
      const randomHash = '0x0a19';

      const [amountToReturnFromContract, lendAmountFromContract] =
        await communityContract.returnToLender(
          newCommunityID1,
          newProject1.address,
        );
      const debtToReduce =
        amountToReturnFromContract.toNumber() -
        lendAmountFromContract.toNumber();
      await expect(
        communityContract
          .connect(nobody)
          .reduceDebt(
            newCommunityID1,
            newProject1.address,
            debtToReduce,
            randomHash,
          ),
      ).to.be.revertedWith('Community::!Owner');
      await expect(
        communityContract
          .connect(lenderCommunity2)
          .reduceDebt(
            newCommunityID1,
            newProject1.address,
            debtToReduce,
            randomHash,
          ),
      ).to.be.revertedWith('Community::!Owner');

      const tx = await communityContract
        .connect(lenderCommunity1)
        .reduceDebt(
          newCommunityID1,
          newProject1.address,
          debtToReduce,
          randomHash,
        );
      await tx.wait();
      expect(tx)
        .to.emit(communityContract, 'DebtReduced')
        .withArgs(
          newCommunityID1,
          newProject1.address,
          lenderCommunity1.address,
          debtToReduce,
          randomHash,
        );

      const [returnAfter] = await communityContract.returnToLender(
        newCommunityID1,
        newProject1.address,
      );
      expect(amountToReturnFromContract.sub(returnAfter)).to.equal(
        debtToReduce,
      );
    });
    it('should be able to reduce debt using escrow', async () => {
      const lenderSigner = signers[3];
      const agentSigner = signers[4];
      const builderSigner = signers[0];
      const randomHash = '0x0a19';

      const [amountToReturnFromContract, lendAmountFromContract] =
        await communityContract.returnToLender(
          newCommunityID2,
          newProject2.address,
        );
      const debtToReduce =
        amountToReturnFromContract.toNumber() -
        lendAmountFromContract.toNumber();
      const data = {
        types: [
          'uint256',
          'address',
          'address',
          'address',
          'address',
          'uint256',
          'bytes',
        ],
        values: [
          newCommunityID2,
          builderSigner.address,
          lenderSigner.address,
          agentSigner.address,
          newProject2.address,
          debtToReduce,
          randomHash,
        ],
      };
      const [encodedData, signature] = await multisig(data, [
        lenderSigner,
        builderSigner,
        agentSigner,
      ]);
      const tx = await communityContract.escrow(encodedData, signature);
      await tx.wait();
      expect(tx)
        .to.emit(communityContract, 'DebtReduced')
        .withArgs(
          newCommunityID2,
          newProject2.address,
          lenderSigner.address,
          debtToReduce,
          randomHash,
        );
      expect(tx)
        .to.emit(communityContract, 'DebtReducedByEscrow')
        .withArgs(agentSigner.address);

      const [returnAfter] = await communityContract.returnToLender(
        newCommunityID2,
        newProject2.address,
      );
      expect(amountToReturnFromContract.sub(returnAfter)).to.equal(
        debtToReduce,
      );
    });
  });
  describe('On-chain signature', () => {
    // assume signers[3] and community owner is smart contract, hence will be using approve hash
    let encodedData: string;
    let encodedMsgHash: string;
    it('should be able to approveHash', async () => {
      // data to add signers[3] in community index 0
      const data = {
        types: ['uint256', 'address', 'bytes'],
        values: [1, signers[3].address, sampleHash],
      };
      encodedData = encodeData(data);
      encodedMsgHash = ethers.utils.keccak256(encodedData);

      const tx = await communityContract
        .connect(signers[2])
        .approveHash(encodedMsgHash);
      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'ApproveHash')
        .withArgs(encodedMsgHash, signers[2].address);

      expect(
        await communityContract.approvedHashes(
          signers[2].address,
          encodedMsgHash,
        ),
      ).to.equal(true);
    });
    it("should revert when hash isn't signed or approved", async () => {
      const tx = communityContract.addMember(encodedData, '0x');
      await expect(tx).to.be.revertedWith('Community::invalid signature');
      // previous signature should not be invalidate
      expect(
        await communityContract.approvedHashes(
          signers[2].address,
          encodedMsgHash,
        ),
      ).to.equal(true);
      await communityContract.connect(signers[3]).approveHash(encodedMsgHash);
      expect(
        await communityContract.approvedHashes(
          signers[3].address,
          encodedMsgHash,
        ),
      ).to.equal(true);
    });
    it('should be able to add member', async () => {
      const tx = await communityContract.addMember(encodedData, '0x');
      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'MemberAdded(uint256,address,bytes)')
        .withArgs(1, signers[3].address, sampleHash);

      const members = await communityContract.members(1);
      const { memberCount } = await communityContract.communities(1);

      expect(members.length).to.equal(4);
      expect(members[0]).to.equal(signers[2].address);
      expect(members[1]).to.equal(signers[1].address);
      expect(members[2]).to.equal(signers[0].address);
      expect(members[3]).to.equal(signers[3].address);
      expect(memberCount).to.equal(4);
    });
    it('should be able to add member with one approve and one signature', async () => {
      // add signers[4]
      const data = {
        types: ['uint256', 'address', 'bytes'],
        values: [1, signers[4].address, sampleHash],
      };
      encodedData = encodeData(data);
      encodedMsgHash = ethers.utils.keccak256(encodedData);

      await communityContract.connect(signers[2]).approveHash(encodedMsgHash);

      const [, signature] = await multisig(data, [
        signers[4], // wrong signature by random address
        signers[4],
      ]);

      const tx = await communityContract.addMember(encodedData, signature);
      await tx.wait();

      await expect(tx)
        .to.emit(communityContract, 'MemberAdded(uint256,address,bytes)')
        .withArgs(1, signers[4].address, sampleHash);

      const members = await communityContract.members(1);
      const { memberCount } = await communityContract.communities(1);

      expect(members[0]).to.equal(signers[2].address);
      expect(members[1]).to.equal(signers[1].address);
      expect(members[2]).to.equal(signers[0].address);
      expect(members[3]).to.equal(signers[3].address);
      expect(members[4]).to.equal(signers[4].address);
      expect(members.length).to.equal(5);
      expect(memberCount).to.equal(5);
    });
  });

  describe('Cannot initialize with zero address', () => {
    it('should revert with zero address', async () => {
      const communityContractImplementation = await deploy<Community>(
        'Community',
      );
      await expect(
        communityContractImplementation.initialize(
          ethers.constants.AddressZero,
        ),
      ).to.be.revertedWith('Community::0 address');
    });
  });
};
