import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ContractTransaction } from 'ethers';
import { encodeData, multisig } from './ethersHelpers';
const types = {
  dispute: ['address', 'uint256', 'uint256', 'bytes', 'bytes'],
  taskAdd: ['bytes[]', 'uint256[]', 'uint256', 'address'],
  taskChange: ['uint256', 'address', 'uint256', 'address'],
  taskPay: ['uint256', 'address'],
}; //all typed data used in disputes
export { types };
/**
 * Build dispute raise transaction parameters
 * @param {string} project - address of project where dispute is being raised
 * @param {number} task - task index/serial where dispute is being raised
 * @param {number} type - integer encoding of IDisputes.DisputeAction for given dispute
 * @param {Array} actionValues - array of data to encode according to type
 * @param {Object} signer - the ethers signer to sign the transaction data with
 * @param {string} cid - the ipfs cid of document provided for dispute
 * @return {Promise<Array>}:
 *  - 0: dispute raise data
 *  - 1: signature of data hash
 */
export async function makeDispute(
  project: any,
  task: any,
  type: any,
  actionValues: any,
  signer: SignerWithAddress,
  cid: any,
): Promise<string[]> {
  let actionTypes;
  if (type == 1) actionTypes = types.taskAdd;
  else if (type == 2) actionTypes = types.taskChange;
  else if (type == 3) actionTypes = types.taskPay;
  else throw new Error(`Disputes Action Type of "${type}" unrecognized`);
  const actionData = {
    types: actionTypes,
    values: actionValues,
  };
  const encodedActionData = encodeData(actionData);
  const data = {
    types: types.dispute,
    values: [project, task, type, encodedActionData, cid],
  };
  const [encodedData, signature] = await multisig(data, [signer]);
  return [encodedData, signature];
}

export async function getDisputeID(tx: ContractTransaction): Promise<any> {
  const receipt = await tx.wait();
  const event = receipt.events?.find(x => x.event === 'DisputeRaised');
  return event?.args?._disputeID;
}
