"use client";

import { createWalletClient, custom } from "viem";
import { useState, useEffect } from "react";
import { baseSepolia } from "../lib/baseSepolia";

/**
 * Takes an EIP-1193 provider (e.g. from Privy) and returns a viem wallet client.
 */
export function useViemWalletClient(eip1193Provider: any | null) {
  const [walletClient, setWalletClient] = useState<any>(null);

  useEffect(() => {
    if (!eip1193Provider) {
      setWalletClient(null);
      return;
    }
    // Create the viem wallet client
    const client = createWalletClient({
      chain: baseSepolia,
      transport: custom(eip1193Provider),
    });
    setWalletClient(client);
  }, [eip1193Provider]);

  return walletClient;
}
