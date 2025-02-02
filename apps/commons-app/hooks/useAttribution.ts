// app/hooks/useAttribution.ts
"use client";
import { useState } from "react";
import { ATTRIBUTION_ABI } from "@/lib/abis/AttributionABI";
import { ATTRIBUTION_ADDRESS } from "../lib/addresses";
import { PublicClient, WalletClient } from "viem";

export function useAttribution(
  publicClient: PublicClient | null,
  walletClient: WalletClient | null
) {
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);

  // recordAttribution
  async function recordAttribution(
    resourceId: bigint,
    parentResources: bigint[],
    relationTypes: number[],
    descriptions: string[]
  ) {
    if(!walletClient){
      setError("No walletClient");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const txHash = await walletClient.writeContract({
        address: ATTRIBUTION_ADDRESS,
        abi: ATTRIBUTION_ABI,
        functionName: "recordAttribution",
        args: [resourceId, parentResources, relationTypes, descriptions],
        chain: undefined,
        account: null
      });
      console.log("recordAttribution txHash:", txHash);
    } catch(err:any){
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return {
    error,
    loading,
    recordAttribution
  };
}
