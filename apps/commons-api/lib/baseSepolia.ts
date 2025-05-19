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
    default: {
      http: [
        process.env.BASE_SEPOLIA_RPC_URL ||
          'https://rpc.ankr.com/base_sepolia/84eb599a88e1a1b26ce621465c7cdb1569c4c1713130315d56bf93af88260c07',
      ],
    },
    public: {
      http: [
        process.env.BASE_SEPOLIA_RPC_URL ||
          'https://rpc.ankr.com/base_sepolia/84eb599a88e1a1b26ce621465c7cdb1569c4c1713130315d56bf93af88260c07',
      ],
    },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
  },
});
