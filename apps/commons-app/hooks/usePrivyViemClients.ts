"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "@/lib/baseSepolia";
import { useViemWalletClient } from "@/hooks/useViemWalletClient";

export function usePrivyViemClients(eip1193Provider: any) {
  // public client (just for reads)
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(baseSepolia.rpcUrls.default.http[0]),
  });

  // wallet client from the user’s EIP-1193
  const walletClient = useViemWalletClient(eip1193Provider);

  return { publicClient, walletClient };
}
