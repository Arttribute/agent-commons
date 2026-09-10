import { defineChain, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
export const WALLET_CHAINS = {
  '11142220': {
    chain: defineChain({
      id: 11142220,
      name: 'Celo Sepolia',
      nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
      rpcUrls: {
        default: { http: ['https://forno.celo-sepolia.celo-testnet.org'] },
      },
      testnet: true,
    }),
    token: '0x01C5C0122039549AD1493B8220cABEdD739BC44E' as Address,
  },
  '84532': {
    chain: baseSepolia,
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
  },
  '8453': {
    chain: base,
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  },
  '5042002': {
    chain: defineChain({
      id: 5042002,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
      testnet: true,
    }),
    token: '0x3600000000000000000000000000000000000000' as Address,
  },
  '296': {
    chain: defineChain({
      id: 296,
      name: 'Hedera Testnet',
      nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
      rpcUrls: { default: { http: ['https://testnet.hashio.io/api'] } },
      testnet: true,
    }),
    token: '0x0000000000000000000000000000000000068cda' as Address,
  },
};
export function walletChain(chainId: string) {
  const config = WALLET_CHAINS[chainId as keyof typeof WALLET_CHAINS];
  if (!config) throw new Error(`Unsupported wallet network ${chainId}`);
  return config;
}
