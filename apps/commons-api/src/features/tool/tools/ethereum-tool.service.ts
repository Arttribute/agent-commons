import { Wallet } from '@coinbase/coinbase-sdk';
import { Injectable } from '@nestjs/common';

export interface EthereumTool {
  checkBalance(): any;

  transferFundsToWallet(props: { address: string; amount: number }): any;
}

// @Injectable()
// export class EthereumToolService {
//   checkBalance(wallet: Wallet) {
//     return fromWallet.getBalance();
//   }

//   transferFundsToWallet(wallet: Wallet['addresses'], amount: number) {
//     const transfer = await fromWallet.createTransfer({
//       amount,
//       assetId: Coinbase.assets.Eth, // Or USDC, WETH, etc.
//       destination: toWallet,
//     });
//     await transfer.wait();
//     return transfer;
//   }
// }
