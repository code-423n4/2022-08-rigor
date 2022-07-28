import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract, utils } from 'ethers';
import { signatureToVRS } from './utils/ethersHelpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';

function vrsToSignature(obj: { v: string; r: string; s: string }) {
  return `0x${obj.r}${obj.s}${obj.v}`;
}

const setup = async () => {
  describe('SignatureDecoder', () => {
    let signatureDecoderMock: Contract;
    let signers: SignerWithAddress[];
    let rawMsgHash: number | utils.BytesLike | utils.Hexable;
    let rawMsgBinary: string | utils.Bytes;
    let encodedMsgHash: number | utils.BytesLike | utils.Hexable;
    let encodedMsgBinary: string | utils.Bytes;

    before('setup signatureDecoder instance', async () => {
      signers = await ethers.getSigners();
      const SignatureDecoderMockFactory = await ethers.getContractFactory(
        'SignatureDecoderMock',
      );
      signatureDecoderMock = await SignatureDecoderMockFactory.deploy();
      await signatureDecoderMock.deployed();

      rawMsgHash = utils.id('test');
      rawMsgBinary = utils.arrayify(rawMsgHash);

      const abiCoder = new ethers.utils.AbiCoder();
      const encodedData = abiCoder.encode(
        ['uint256', 'string'],
        ['123', 'Hello!'],
      );
      encodedMsgHash = ethers.utils.keccak256(encodedData);
      encodedMsgBinary = ethers.utils.arrayify(encodedMsgHash);
    });

    it('rawMsg: should recover zero address for invalid signature', async () => {
      let recoverredAddress = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        '0x19',
        0,
      );
      expect(recoverredAddress).to.equal(ADDRESS_ZERO);
      recoverredAddress = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        '0x',
        0,
      );
      expect(recoverredAddress).to.equal(ADDRESS_ZERO);
      let signature = await signers[0].signMessage(rawMsgBinary);
      signature = signature.slice(0, -2) + (18).toString(16);
      recoverredAddress = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        0,
      );
      expect(recoverredAddress).to.equal(ADDRESS_ZERO);
    });

    it('rawMsg: should recover single key', async () => {
      const account = signers[0].address;
      const signature = await signers[0].signMessage(rawMsgBinary);
      const recoverredAddress = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        0,
      );
      const recoverredAccount = ethers.utils.verifyMessage(
        rawMsgBinary,
        signature,
      );
      expect(recoverredAccount).to.equal(recoverredAddress);
      expect(recoverredAccount).to.equal(account);
    });

    it('rawMsg: should recover single key if v is 0', async () => {
      const account = signers[0].address;
      let signature = await signers[0].signMessage(rawMsgBinary);
      const { v, r, s } = signatureToVRS(signature);
      const numV = Number.parseInt(`0x${v}`, 16);
      const newV = (numV >= 27 ? numV - 27 : numV).toString(16);
      const stringV = newV.length === 1 ? `0${newV}` : newV;
      signature = vrsToSignature({ v: stringV, r, s });
      const recoverredAddress = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        0,
      );
      const recoverredAccount = ethers.utils.verifyMessage(
        rawMsgBinary,
        signature,
      );
      expect(recoverredAccount).to.equal(recoverredAddress);
      expect(recoverredAccount).to.equal(account);
    });

    it('rawMsg: should recover 2 keys', async () => {
      const account_0 = signers[0].address;
      const account_1 = signers[1].address;
      const signature_0 = await signers[0].signMessage(rawMsgBinary);
      const signature_1 = await signers[1].signMessage(rawMsgBinary);
      const signature = signature_0 + signature_1.slice(2);
      const recoverredAddress_0 = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        0,
      );
      const recoverredAddress_1 = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        1,
      );
      expect(recoverredAddress_0).to.equal(account_0);
      expect(recoverredAddress_1).to.equal(account_1);
    });

    it('rawMsg: should recover 3 keys', async () => {
      const account_0 = signers[0].address;
      const account_1 = signers[1].address;
      const account_2 = signers[2].address;
      const signature_0 = await signers[0].signMessage(rawMsgBinary);
      const signature_1 = await signers[1].signMessage(rawMsgBinary);
      const signature_2 = await signers[2].signMessage(rawMsgBinary);
      const signature =
        signature_0 + signature_1.slice(2) + signature_2.slice(2);
      const recoverredAddress_0 = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        0,
      );
      const recoverredAddress_1 = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        1,
      );
      const recoverredAddress_2 = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        2,
      );
      expect(recoverredAddress_0).to.equal(account_0);
      expect(recoverredAddress_1).to.equal(account_1);
      expect(recoverredAddress_2).to.equal(account_2);
    });

    it('rawMsg: should recover single key signed with random wallet', async () => {
      const signer = ethers.Wallet.createRandom();
      const account = signer.address;
      const signature = await signer.signMessage(rawMsgBinary);
      const recoverredAddress = await signatureDecoderMock.recoverKey(
        rawMsgHash,
        signature,
        0,
      );
      const recoverredAccount = ethers.utils.verifyMessage(
        rawMsgBinary,
        signature,
      );
      expect(recoverredAccount).to.equal(recoverredAddress);
      expect(recoverredAccount).to.equal(account);
    });

    it('encodedMsg: should recover single key', async () => {
      const account = signers[0].address;
      const signature = await signers[0].signMessage(encodedMsgBinary);
      const recoverredAddress = await signatureDecoderMock.recoverKey(
        encodedMsgHash,
        signature,
        0,
      );
      const recoverredAccount = ethers.utils.verifyMessage(
        encodedMsgBinary,
        signature,
      );
      expect(recoverredAccount).to.equal(recoverredAddress);
      expect(recoverredAccount).to.equal(account);
    });

    it('encodedMsg: should recover 2 keys', async () => {
      const account_0 = signers[0].address;
      const account_1 = signers[1].address;
      const signature_0 = await signers[0].signMessage(encodedMsgBinary);
      const signature_1 = await signers[1].signMessage(encodedMsgBinary);
      const signature = signature_0 + signature_1.slice(2);
      const recoverredAddress_0 = await signatureDecoderMock.recoverKey(
        encodedMsgHash,
        signature,
        0,
      );
      const recoverredAddress_1 = await signatureDecoderMock.recoverKey(
        encodedMsgHash,
        signature,
        1,
      );
      expect(recoverredAddress_0).to.equal(account_0);
      expect(recoverredAddress_1).to.equal(account_1);
    });

    it('encodedMsg: should recover 3 keys', async () => {
      const account_0 = signers[0].address;
      const account_1 = signers[1].address;
      const account_2 = signers[2].address;
      const signature_0 = await signers[0].signMessage(encodedMsgBinary);
      const signature_1 = await signers[1].signMessage(encodedMsgBinary);
      const signature_2 = await signers[2].signMessage(encodedMsgBinary);
      const signature =
        signature_0 + signature_1.slice(2) + signature_2.slice(2);
      const recoverredAddress_0 = await signatureDecoderMock.recoverKey(
        encodedMsgHash,
        signature,
        0,
      );
      const recoverredAddress_1 = await signatureDecoderMock.recoverKey(
        encodedMsgHash,
        signature,
        1,
      );
      const recoverredAddress_2 = await signatureDecoderMock.recoverKey(
        encodedMsgHash,
        signature,
        2,
      );
      expect(recoverredAddress_0).to.equal(account_0);
      expect(recoverredAddress_1).to.equal(account_1);
      expect(recoverredAddress_2).to.equal(account_2);
    });

    it('encodedMsg: should recover single key signed with random wallet', async () => {
      const signer = ethers.Wallet.createRandom();
      const account = signer.address;
      const signature = await signer.signMessage(encodedMsgBinary);
      const recoverredAddress = await signatureDecoderMock.recoverKey(
        encodedMsgHash,
        signature,
        0,
      );
      const recoverredAccount = ethers.utils.verifyMessage(
        encodedMsgBinary,
        signature,
      );
      expect(recoverredAccount).to.equal(recoverredAddress);
      expect(recoverredAccount).to.equal(account);
    });
  });
};

setup().then(() => {
  run();
});
