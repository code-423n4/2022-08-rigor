import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { Contract } from '@ethersproject/contracts';
import { Libraries } from '@nomiclabs/hardhat-ethers/types';

const path = '../../artifacts/contracts/interfaces/'; // path to artifact build directory
const artifacts = [
  'ICommunity',
  'IDebtToken',
  'IDisputes',
  'IHomeFi',
  'IProject',
]; // add or remove contract interface names to include or exclude in abi collector
//@todo autodetect artifacts?

const abiCoder = new ethers.utils.AbiCoder();
export { abiCoder };
/**
 * Given a name for a contract build artifact, return JSON abi
 * @param {string} artifact - name of contract to look for artifact for
 * @return {ethers.utils.Interface} - ethers interface of contract
 */
export function toABI(artifact: any): any {
  return new ethers.utils.Interface(
    require(`${path}${artifact}.sol/${artifact}.json`).abi,
  );
}

/**
 * Get block.timestamp for HRE ethers provider
 * @returns unix epoch timestamp for current block
 */
export async function currentTimestamp(): Promise<any> {
  const block = await ethers.provider.getBlock('latest');
  return +block.timestamp;
}

/**
 * Abi Encode data given typed data
 *
 * @param {Object} data - typed data to sign
 * @notice example: {
 *   types: ['uint256', 'address'],
 *   values: [0, 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE]
 * }
 * @return data encoded by abi encoder
 */
export function encodeData(data: { types: any; values: any }): string {
  return abiCoder.encode(data.types, data.values);
}
/**
 * Sign data from one or more ethers wallets
 *
 * @param {Object} data - typed data to sign
 * @notice example: {
 *   types: ['uint256', 'address'],
 *   values: [0, 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE]
 * }
 * @param {Array} signers - array of wallets to collect signatures for
 * @return
 *   - encodedData - data encoded by abi encoder
 *   - signature {String} - the signed hashes of the data
 * @notice if multiple signers concatonates signatures together in single string
 */
export async function multisig(
  data: any,
  signers: SignerWithAddress[],
): Promise<string[]> {
  const encodedData = encodeData(data);
  const encodedMsgHash = ethers.utils.keccak256(encodedData);
  const encodedMsgBinary = ethers.utils.arrayify(encodedMsgHash);
  let signature = '0x';
  for (let signer of signers)
    signature =
      signature + (await signer.signMessage(encodedMsgBinary)).slice(2);
  return [encodedData, signature];
}

function strip0x(input: string) {
  return input.replace(/^0x/, '');
}

export function signatureToVRS(rawSignature: string): any {
  const signature = strip0x(rawSignature);
  const v = signature.substr(64 * 2);
  const r = signature.substr(0, 32 * 2);
  const s = signature.substr(32 * 2, 32 * 2);
  return { v, r, s };
}

export async function deploy<Type>(
  typeName: string,
  libraries?: Libraries,
  ...args: any[]
): Promise<Type> {
  const ctrFactory = await ethers.getContractFactory(typeName, { libraries });

  const ctr = (await ctrFactory.deploy(...args)) as unknown as Type;
  await (ctr as unknown as Contract).deployed();
  return ctr;
}

export async function getContractAt<Type>(
  typeName: string,
  address: string,
): Promise<Type> {
  const ctr = (await ethers.getContractAt(
    typeName,
    address,
  )) as unknown as Type;
  return ctr;
}
