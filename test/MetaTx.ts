import { expect } from 'chai';
import { ethers } from 'hardhat';
import { migrate } from './utils';
import { MinimalForwarder } from '../artifacts/types/MinimalForwarder';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { HomeFi } from '../artifacts/types/HomeFi';
import { TypedDataDomain } from '@ethersproject/abstract-signer';

const ForwardRequest = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'gas', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'data', type: 'bytes' },
];

const setup = async () => {
  describe('Meta Transactions', () => {
    let homeFiContract: HomeFi;
    let signers: SignerWithAddress[];
    let domain: TypedDataDomain;
    let forwarder: MinimalForwarder;
    before('setup', async () => {
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

    it('should replace admin on HomeFi', async () => {
      let tx = await homeFiContract.replaceAdmin(signers[1].address);
      await expect(tx)
        .to.emit(homeFiContract, 'AdminReplaced')
        .withArgs(signers[1].address);
      expect(await homeFiContract.admin()).to.equal(signers[1].address);

      tx = await homeFiContract
        .connect(signers[1])
        .replaceAdmin(signers[0].address);
      expect(await homeFiContract.admin()).to.equal(signers[0].address);
    });

    it('should replace admin on HomeFi as metaTx', async () => {
      expect(await homeFiContract.admin()).to.equal(signers[0].address);
      const { data } = await homeFiContract.populateTransaction.replaceAdmin(
        signers[1].address,
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
      const verifiedAddress = ethers.utils.verifyTypedData(
        domain,
        { ForwardRequest },
        message,
        signature,
      );
      expect(verifiedAddress).to.equal(await signers[0].getAddress());

      // @ts-ignore
      const verifiedFromContract = await forwarder.verify(message, signature);
      const nonce = await forwarder.getNonce(message.from);
      expect(nonce).to.equal(0);
      expect(verifiedFromContract).to.equal(true);

      // @ts-ignore
      const tx = await forwarder
        .connect(signers[3])
        .execute(message, signature);
      expect(await homeFiContract.admin()).to.equal(signers[1].address);
      expect(await forwarder.getNonce(message.from)).to.equal(1);
    });

    it('should be able to set new forwarder', async () => {
      const { forwarder: newForwarder } = await migrate();
      expect(await homeFiContract.trustedForwarder()).to.equal(
        forwarder.address,
      );
      const tx = await homeFiContract
        .connect(signers[1])
        .setTrustedForwarder(newForwarder.address);
      expect(await homeFiContract.trustedForwarder()).to.equal(
        newForwarder.address,
      );
    });
  });
};

setup().then(() => {
  run();
});
