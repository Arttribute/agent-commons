import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { ClassProvider, Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class CoinbaseService implements OnModuleInit {
  private coinbase: Coinbase | undefined;

  constructor() {}

  onModuleInit() {
    console.log({
      apiKeyName: process.env.COINBASE_API_KEY_NAME!,
      privateKey: process.env.COINBASE_API_KEY_SECRET!,
    });
    this.coinbase = Coinbase.configure({
      apiKeyName: process.env.COINBASE_API_KEY_NAME!,
      privateKey: process.env.COINBASE_API_KEY_SECRET!,
    });
  }

  /**
   * Example: create a new developer-managed wallet
   */
  async createDeveloperManagedWallet() {
    // For demo, we create a wallet on Base Sepolia
    const wallet = await Wallet.create();
    return wallet;
  }

  /**
   * Example: fund wallet from faucet (Base Sepolia)
   */
  async fundWalletFromFaucet(wallet: Wallet) {
    const faucetTx = await wallet.faucet();
    await faucetTx.wait();
    return faucetTx;
  }

  /**
   * Example: transfer from one wallet to another
   */
  async transferFunds(fromWallet: Wallet, toWallet: Wallet, amount: number) {
    const transfer = await fromWallet.createTransfer({
      amount,
      assetId: Coinbase.assets.Eth, // Or USDC, WETH, etc.
      destination: toWallet,
    });
    await transfer.wait();
    return transfer;
  }
}

export const CoinbaseServiceProvider: ClassProvider<CoinbaseService> = {
  provide: CoinbaseService,
  useClass: CoinbaseService,
};
