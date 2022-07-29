import { ContractTransaction } from 'ethers';

/**
 * Get the id of a community that has been added in a transaction
 * @param {Object} tx - the transaction where the CommunityAdded event occurred
 * @returns {BN} - the community ID
 */
export async function getCommunityID(tx: ContractTransaction): Promise<any> {
  const receipt = await tx.wait();
  const event = receipt.events?.find(x => x.event === 'CommunityAdded');
  return event?.args?._communityID;
}

// export utilities around community use
