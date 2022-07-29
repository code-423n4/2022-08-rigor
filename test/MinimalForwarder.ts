// @ts-check
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { HomeFi } from '../artifacts/types/HomeFi';
import { MinimalForwarder } from '../artifacts/types/MinimalForwarder';
import { migrate } from './utils';
import { TypedDataDomain } from '@ethersproject/abstract-signer';

const setup = async () => {
  describe('MinimalForwarder', () => {
    let signers: SignerWithAddress[];
    let homeFiContract: HomeFi;
    let forwarder: MinimalForwarder;
    let domain: TypedDataDomain;
    const ForwardRequest = [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'gas', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ];

    before('setup community instance', async () => {
      signers = await ethers.getSigners();
      ({ homeFiContract, forwarder } = await migrate());
      let { chainId } = await ethers.provider.getNetwork();
      domain = {
        name: 'MinimalForwarder',
        version: '0.0.1',
        chainId,
        verifyingContract: forwarder.address,
      };
    });

    it('should revert transaction with wrong signatures', async () => {
      const newTreasury = signers[1].address;
      const { data } = await homeFiContract.populateTransaction.replaceTreasury(
        newTreasury,
      );
      const gasLimit = await ethers.provider.estimateGas({
        to: homeFiContract.address,
        from: signers[0].address,
        data,
      });
      const message = {
        from: signers[0].address,
        to: homeFiContract.address,
        value: 0,
        gas: gasLimit.toNumber(),
        nonce: 0,
        data,
      };
      const signature = await signers[1]._signTypedData(
        domain,
        { ForwardRequest },
        message,
      );
      // @ts-ignore
      const tx = forwarder.connect(signers[3]).execute(message, signature);
      await expect(tx).to.be.revertedWith(
        'MinimalForwarder: signature does not match request',
      );
    });

    it('should be able to complete meta transaction', async () => {
      const newTreasury = signers[1].address;
      const { data } = await homeFiContract.populateTransaction.replaceTreasury(
        newTreasury,
      );
      if (!data) {
        throw Error('No data');
      }
      const gasLimit = await ethers.provider.estimateGas({
        to: homeFiContract.address,
        from: signers[0].address,
        data,
      });
      const message = {
        from: signers[0].address,
        to: homeFiContract.address,
        value: 0,
        gas: gasLimit.toNumber(),
        nonce: 0,
        data,
      };
      const signature = await signers[0]._signTypedData(
        domain,
        { ForwardRequest },
        message,
      );
      // @ts-ignore
      const tx = await forwarder
        .connect(signers[3])
        .execute(message, signature);
      await expect(tx)
        .to.emit(homeFiContract, 'TreasuryReplaced')
        .withArgs(newTreasury);

      expect(await homeFiContract.treasury()).to.equal(newTreasury);
    });
  });
};

setup().then(() => {
  run();
});
