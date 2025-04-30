import { defineChain } from "viem";
import type { Chain } from "viem";

interface ExtendedChainConfig {
  chain: Chain;
  explorerApiUrl: string;
  explorerApiKey: string | undefined;
}

// Predefined chain definitions
const mainnet = defineChain({
  id: 1,
  name: "Ethereum Mainnet",
  network: "homestead",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.ankr.com/eth"] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://etherscan.io" },
  },
});

const arbitrum = defineChain({
  id: 42161,
  name: "Arbitrum One",
  network: "arbitrum",
  nativeCurrency: { name: "Arbitrum ETH", symbol: "AETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://arb1.arbitrum.io/rpc"] } },
  blockExplorers: {
    default: { name: "Arbitrum Explorer", url: "https://explorer.arbitrum.io" },
  },
});

const polygon = defineChain({
  id: 137,
  name: "Polygon Mainnet",
  network: "polygon",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ankr.com/polygon"] } },
  blockExplorers: {
    default: { name: "Polygonscan", url: "https://polygonscan.com" },
  },
});

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  network: "base-sepolia",
  nativeCurrency: { name: "Base ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ankr.com/base_sepolia"] } },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://sepolia.basescan.org" },
  },
});

// Add more networks as needed

const chainMap: Record<string, Chain> = {
  ethereum: mainnet,
  arbitrum,
  polygon,
  base: baseSepolia, // "base" => base sepolia testnet
};

const configMap: Record<string, ExtendedChainConfig> = {
  ethereum: {
    chain: mainnet,
    explorerApiUrl: "https://api.etherscan.io/api",
    explorerApiKey: process.env.ETHERSCAN_API_KEY, // or a literal string
  },
  arbitrum: {
    chain: arbitrum,
    explorerApiUrl: "https://api.arbiscan.io/api",
    explorerApiKey: process.env.ARBISCAN_API_KEY,
  },
  polygon: {
    chain: polygon,
    explorerApiUrl: "https://api.polygonscan.com/api",
    explorerApiKey: process.env.POLYGONSCAN_API_KEY,
  },
  base: {
    chain: baseSepolia,
    explorerApiUrl: "https://api-sepolia.basescan.org/api",
    explorerApiKey: process.env.BASESCAN_API_KEY,
  },
  // Add or modify entries for other networks if needed.
};

export function getChainByName(name: string): Chain {
  const chain = chainMap[name];
  if (!chain) {
    // default fallback or throw
    throw new Error(`Unsupported chain name: ${name}`);
  }
  return chain;
}

export function getChainConfig(name: string): ExtendedChainConfig {
  const config = configMap[name];
  if (!config) {
    throw new Error(`Unsupported chain name: ${name}`);
  }
  return config;
}
