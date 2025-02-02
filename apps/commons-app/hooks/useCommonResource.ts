// app/hooks/useCommonResource.ts
"use client";
import { useState } from "react";
import { COMMON_RESOURCE_ABI } from "@/lib/abis/CommonResourceABI";
import { COMMON_RESOURCE_ADDRESS } from "../lib/addresses";
import { PublicClient, WalletClient } from "viem";

export function useCommonResource(
  publicClient: PublicClient | null,
  walletClient: WalletClient | null
) {
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);

  // Only implementing createResource in this example
  async function createResource(
    actualCreator: `0x${string}`,
    metadata: string,
    resourceFile: string,
    requiredReputation: bigint,
    usageCost: bigint,
    contributors: `0x${string}`[],
    shares: bigint[],
    isCoreResource: boolean
  ){
    if(!walletClient){
      setError("No walletClient");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const txHash = await walletClient.writeContract({
        address: COMMON_RESOURCE_ADDRESS,
        abi: COMMON_RESOURCE_ABI,
        functionName: "createResource",
        args: [
          actualCreator,
          metadata,
          resourceFile,
          requiredReputation,
          usageCost,
          contributors,
          shares,
          isCoreResource
        ],
        chain: undefined,
        account: null
      });
      console.log("createResource txHash:", txHash);
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
    createResource
  };
}
