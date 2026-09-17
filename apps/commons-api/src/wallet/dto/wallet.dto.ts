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
  usdc: string; // formatted USDC balance (6 decimals)
  native: string; // formatted native token balance (ETH)
}

export interface WalletResponseDto {
  id: string;
  agentId: string;
  walletType: WalletType;
  provider?: string;
  providerWalletId?: string | null;
  address: string;
  smartAccountAddress?: string | null;
  chainId: string;
  label?: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface WalletActivityItem {
  hash: string;
  chainId: string;
  /** token = USDC transfer, native = value transfer, call = outgoing contract call */
  kind: 'token' | 'native' | 'call';
  direction: 'in' | 'out' | 'self';
  asset: string;
  amount: string; // formatted
  from: string;
  to: string | null;
  timestamp: string | null;
  status: 'success' | 'failed' | 'pending';
  method: string | null;
}

export interface WalletActivityDto {
  address: string;
  chainId: string;
  /** false when the network has no activity index (history lives on its explorer) */
  supported: boolean;
  items: WalletActivityItem[];
}
