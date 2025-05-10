"use client";
import { defineChain } from "viem";

/**
 * Custom chain definition for Base Sepolia
 */
export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  network: "base-sepolia",
  nativeCurrency: {
    name: "Base Sepolia ETH",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || ""] },
    public: { http: [process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || ""] },
  },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://sepolia.basescan.org" },
  },
});
