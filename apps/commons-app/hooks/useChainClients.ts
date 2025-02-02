import { createPublicClient, createWalletClient, custom, http } from "viem";
import { useEffect, useState } from "react";
import { baseSepolia } from "@/lib/baseSepolia";

export function useChainClients(eip1193Provider: any) {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(baseSepolia.rpcUrls.default.http[0]),
  });

  const [walletClient, setWalletClient] = useState<any>(null);

  useEffect(() => {
    if (!eip1193Provider) {
      setWalletClient(null);
      return;
    }
    const wc = createWalletClient({
      chain: baseSepolia,
      transport: custom(eip1193Provider),
    });
    setWalletClient(wc);
  }, [eip1193Provider]);

  return { publicClient, walletClient };
}
