export type WalletType = 'eoa' | 'erc4337' | 'external';

export interface CreateWalletDto {
  agentId: string;
  walletType?: WalletType;
  label?: string;
  /** For 'external' wallets: the owner-provided address (no key stored) */
  externalAddress?: string;
  /** Chain ID, defaults to Base Sepolia (84532) */
  chainId?: string;
}

export interface WalletBalanceDto {
  address: string;
  chainId: string;
  usdc: string;    // formatted USDC balance (6 decimals)
  native: string;  // formatted native token balance (ETH)
}

export interface WalletResponseDto {
  id: string;
  agentId: string;
  walletType: WalletType;
  address: string;
  smartAccountAddress?: string | null;
  chainId: string;
  label?: string | null;
  isActive: boolean;
  createdAt: Date;
}
