import { network } from 'hardhat';

export async function mineBlock(timestamp: number): Promise<void> {
  await network.provider.request({
    method: 'evm_mine',
    params: [timestamp],
  });
}

export async function setAutomine(automine: boolean): Promise<void> {
  await network.provider.request({
    method: 'evm_setAutomine',
    params: [automine],
  });
}

export async function setNextBlockTimestamp(timestamp: number): Promise<void> {
  await network.provider.request({
    method: 'evm_setNextBlockTimestamp',
    params: [timestamp],
  });
}
