import fetch from 'node-fetch';
import delay from 'delay';
import { subtask, types } from 'hardhat/config';
import { isAddress, getAddress } from '@ethersproject/address';
import { HardhatConfig, Network, RunTaskFunction } from 'hardhat/types';

const TASK_VERIFY_GET_ETHERSCAN_ENDPOINT = 'verify:get-etherscan-endpoint';
const TASK_VERIFY_VERIFY_PROXY = 'verify:verify-proxy';

const ETHERSCAN_CHAIN_IDS = [1, 3, 4, 5, 42];

const verifySubtask = async (
  { address }: { address: string },
  {
    config,
    network,
    run,
  }: { run: RunTaskFunction; network: Network; config: HardhatConfig },
) => {
  const chainId = parseInt(await network.provider.send('eth_chainId'), 16);

  if (!ETHERSCAN_CHAIN_IDS.includes(chainId)) {
    throw new Error(`${chainId} is not supported by Etherscan.`);
  }

  if (!isAddress(address)) {
    throw new Error(`${address} is an invalid address.`);
  }

  const { etherscan } = config;

  if (etherscan.apiKey === undefined || etherscan.apiKey.trim() === '') {
    throw new Error(
      `Please provide an Etherscan API token via hardhat config.
E.g.: { [...], etherscan: { apiKey: 'an API key' }, [...] }
See https://etherscan.io/apis`,
    );
  }

  const etherscanAPIEndpoints = (await run(TASK_VERIFY_GET_ETHERSCAN_ENDPOINT))
    .urls;

  const { apiURL, browserURL } = etherscanAPIEndpoints;
  const { apiKey } = etherscan;

  const status = await verifyContract(apiURL, apiKey, getAddress(address));

  if (!status) {
    throw new Error(`Failed to verify Proxy contract at ${address}`);
  }

  const contractURL = `${browserURL}/address/${address}#code`;

  console.log(
    `Successfully verified Proxy contract on Etherscan.
${contractURL}`,
  );
};

const verifyContract = async (
  apiURL: string,
  apiKey: string,
  address: string,
) => {
  try {
    const result = await fetch(
      `${apiURL}?module=contract&action=verifyproxycontract&apikey=${apiKey}`,
      {
        method: 'POST',
        body: `address=${address}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    if (result.ok) {
      const data: any = await result.json();
      if (data.status !== '1') {
        return false;
      }
      const guid = data.result;

      return verificationStatus(apiURL, apiKey, guid);
    }
    return false;
  } catch (error) {
    return false;
  }
};

const verificationStatus = async (
  apiURL: string,
  apiKey: string,
  guid: string,
) => {
  let numTries = 0;
  while (numTries < 20) {
    await delay(1000);

    try {
      const result = await fetch(
        `${apiURL}?module=contract&action=checkproxyverification&guid=${guid}&apikey=${apiKey}`,
      );
      if (result.ok) {
        const data: any = await result.json();
        if (data.status === '1') {
          console.log(`\n${data.result}`);
          return true;
        }
      }
    } catch (error) {
      return false;
    }
    numTries++;
  }
};

subtask(TASK_VERIFY_VERIFY_PROXY)
  .addParam('address', undefined, undefined, types.string)
  .setAction(verifySubtask);
