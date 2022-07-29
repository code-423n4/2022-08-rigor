import { task } from 'hardhat/config';
import Safe, { EthersAdapter } from '@gnosis.pm/safe-core-sdk';
import { SafeTransactionDataPartial } from '@gnosis.pm/safe-core-sdk-types';
import SafeServiceClient from '@gnosis.pm/safe-service-client';

task('gnosisCreateTransaction', 'Create a gnosis safe transaction')
  .addParam('gnosisSafeAddress', 'address of the gnosis safe')
  .addParam('txTo', 'destination address')
  .addParam(
    'txValue',
    'msg.value, native currency, transferred in the transaction',
  )
  .addParam('txData', 'transaction encode data')
  .addParam('safeServiceClient', 'gnosis safe service client url')
  .setAction(
    async (
      { gnosisSafeAddress, txTo, txValue, txData, safeServiceClient },
      { ethers },
    ) => {
      const safeService = new SafeServiceClient(safeServiceClient);

      const [owner1] = await ethers.getSigners();
      if (!owner1.provider) {
        process.exit(1);
      }

      const ethAdapterOwner1 = new EthersAdapter({
        ethers,
        signer: owner1,
      });

      const safeSdk: Safe = await Safe.create({
        ethAdapter: ethAdapterOwner1,
        safeAddress: gnosisSafeAddress,
      });

      const pendingTxs: any = await safeService.getPendingTransactions(
        gnosisSafeAddress,
      );

      const transactions: SafeTransactionDataPartial[] = [
        {
          to: txTo,
          value: txValue,
          data: txData,
          nonce: pendingTxs.countUniqueNonce || undefined,
        },
      ];

      const safeTransaction = await safeSdk.createTransaction(...transactions);
      // console.log("Safe Transaction: ",safeTransaction.data);

      const safeTransactionHash = await safeSdk.getTransactionHash(
        safeTransaction,
      );
      const owner1Signature = await safeSdk.signTransactionHash(
        safeTransactionHash,
      );

      await safeService.proposeTransaction(
        gnosisSafeAddress,
        safeTransaction.data,
        safeTransactionHash,
        owner1Signature,
      );
      console.log(`Transaction sent to Safe Transaction Service`);
    },
  );
