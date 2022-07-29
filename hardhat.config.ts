import '@nomiclabs/hardhat-waffle';
import * as dotenv from 'dotenv';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import { HardhatUserConfig } from 'hardhat/config';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import './tasks/index';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-contract-sizer';

dotenv.config();

const {
  INFURA,
  ACCOUNT_PRIVATE_KEY,
  MNEMONIC,
  ETHERSCAN_API_KEY,
  CI,
  REPORT_GAS,
  COINMARKETCAP_API_KEY,
  REPORT_SIZE,
  REPORT_GAS_PRICE,
} = process.env;

//if using infura, you can add new networks by adding the name as it is seen in the infura url
const INFURA_NETWORKS = [
  'mainnet',
  'rinkeby',
  'arbitrum-mainnet',
  'arbitrum-rinkeby',
];
const networks = CI
  ? [] // Do not initialize network info on github CI
  : ['rinkeby'];

const accounts = ACCOUNT_PRIVATE_KEY
  ? //Private key overrides mnemonic - leave pkey empty in .env if using mnemonic
    [`0x${ACCOUNT_PRIVATE_KEY}`]
  : {
      mnemonic: MNEMONIC,
      path: "m/44'/60'/0'/0",
      initialIndex: 0,
      count: 10,
    };

/**
 * Given the name of a network build a Hardhat Network object
 * @param {string} _network - the string name of the network
 * @return {INetwork} - the Hardhat Network object
 */
const makeNetwork = (_network: string): any => {
  if (INFURA_NETWORKS.includes(_network))
    return {
      url: `https://${_network}.infura.io/v3/${INFURA}`,
      gasMultiplier: 2,
      accounts,
    };

  return {};
};

const config: HardhatUserConfig & {
  typechain: { outDir: string; target: string };
} = {
  typechain: {
    outDir: 'artifacts/types',
    target: 'ethers-v5',
  },
  solidity: {
    version: '0.8.6',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: networks.reduce((obj: any, entry) => {
    obj[entry] = makeNetwork(entry);
    return obj;
  }, {}),
  // if you don't want to rely on infura network builder module
  // networks: {
  //   rinkeby: {
  //     url: `https://rinkeby.infura.io/v3/${INFURA}`,
  //     account: [`0x${ACCOUNT_PRIVATE_KEY}`]
  //   }
  // }
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: REPORT_SIZE === 'true',
    disambiguatePaths: false,
  },
  gasReporter: {
    enabled: REPORT_GAS === 'true',
    currency: 'USD',
    gasPrice: Number.parseInt(REPORT_GAS_PRICE ?? '50'),
    coinmarketcap: `${COINMARKETCAP_API_KEY || ''}`,
  },
  mocha: {
    delay: true,
  },
};
export default config;
