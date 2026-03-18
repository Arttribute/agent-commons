import { Injectable } from '@nestjs/common';

/**
 * WalletTool — agent-facing wallet operations.
 * Phase 10: CommonToken interactions removed. New onchain tooling TBD.
 */
/** @deprecated Use WalletTool */
export type EthereumTool = WalletTool;

export interface WalletTool {
  /**
   * Get the USDC balance of the agent's wallet
   */
  getWalletBalance(): Promise<{ usdc: string; address: string }>;
}

@Injectable()
export class EthereumToolService implements WalletTool {
  // Wallet operations will be wired to the new WalletService once the
  // owner-controlled wallet architecture (Phase 10) is fully deployed.

  async getWalletBalance(): Promise<{ usdc: string; address: string }> {
    return { usdc: '0', address: '' };
  }
}
