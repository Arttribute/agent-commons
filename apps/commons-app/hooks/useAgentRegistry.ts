// app/hooks/useAgentRegistry.ts
"use client";
import { useState } from "react";
import { AGENT_REGISTRY_ABI } from "@/lib/abis/AgentRegistryABI";
import { AGENT_REGISTRY_ADDRESS } from "../lib/addresses";
import { PublicClient, WalletClient } from "viem";

export function useAgentRegistry(
  publicClient: PublicClient | null,
  walletClient: WalletClient | null
) {
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);

  // READ: registeredAgents
  async function isRegistered(agent: `0x${string}`) {
    if(!publicClient) {
      setError("No publicClient");
      return false;
    }
    try {
      const result: boolean = (await publicClient.readContract({
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        functionName: "registeredAgents",
        args: [agent],
      })) as boolean;
      return result;
    } catch(err:any) {
      setError(err.message);
      return false;
    }
  }

  // WRITE: registerAgent
  async function registerAgent(
    agentAddr: `0x${string}`,
    metadata: string,
    isCommon: boolean
  ) {
    if(!walletClient) {
      setError("No walletClient");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const txHash = await walletClient.writeContract({
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        functionName: "registerAgent",
        args: [agentAddr, metadata, isCommon],
        chain: undefined,
        account: null
      });
      console.log("registerAgent txHash:", txHash);
    } catch(err:any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // WRITE: updateReputation
  async function updateReputation(agentAddr: `0x${string}`, repChange: bigint){
    if(!walletClient){
      setError("No walletClient");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const txHash = await walletClient.writeContract({
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        functionName: "updateReputation",
        args: [agentAddr, repChange],
        chain: undefined,
        account: null
      });
      console.log("updateReputation txHash:", txHash);
    } catch(err:any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return {
    error,
    loading,
    isRegistered,
    registerAgent,
    updateReputation,
  };
}
