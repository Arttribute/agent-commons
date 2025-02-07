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
  const [error, setError] = useState<string | null>(null);
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
  ) {
    if (!walletClient) {
      setError("No walletClient");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const [address] = await walletClient.getAddresses();
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
          isCoreResource,
        ],
        chain: undefined,
        account: address,
      });

      console.log("createResource txHash:", txHash);
      //log all the arguments
      console.log("actualCreator:", actualCreator);
      console.log("metadata:", metadata);
      console.log("resourceFile:", resourceFile);
      console.log("requiredReputation:", requiredReputation);
      console.log("usageCost:", usageCost);
      console.log("contributors:", contributors);
      console.log("shares:", shares);
      console.log("isCoreResource:", isCoreResource);
      //show reason for transaction reverting
    } catch (err: any) {
      console.error("Full error object:", err);
      console.error("Error cause:", err?.cause);
      console.error("Error details:", err?.cause?.details);
      console.error("Error shortMessage:", err?.cause?.shortMessage);

      // If the error has a specific property for revert reason:
      if (err?.cause?.details) {
        setError(err.cause.details);
      } else if (err?.cause?.shortMessage) {
        setError(err.cause.shortMessage);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return {
    error,
    loading,
    createResource,
  };
}
