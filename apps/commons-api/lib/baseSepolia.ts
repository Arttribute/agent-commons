import { defineChain } from 'viem';

/**
 * Custom chain definition for Base Sepolia
 */
export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  network: 'base-sepolia',
  nativeCurrency: {
    name: 'Base Sepolia ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.ankr.com/base_sepolia'] },
    public: { http: ['https://rpc.ankr.com/base_sepolia'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
  },
});
