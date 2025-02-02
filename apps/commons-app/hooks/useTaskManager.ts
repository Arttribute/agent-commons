// app/hooks/useTaskManager.ts
"use client";
import { useState } from "react";
import { TASK_MANAGER_ABI } from "@/lib/abis/TaskManagerABI";
import { TASK_MANAGER_ADDRESS } from "../lib/addresses";
import { PublicClient, WalletClient } from "viem";

export function useTaskManager(
  publicClient: PublicClient | null,
  walletClient: WalletClient | null
) {
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);

  // createTask
  async function createTask(
    metadata: string,
    reward: bigint,
    resourceBased: boolean,
    parentTaskId: bigint,
    maxParticipants: bigint
  ){
    if(!walletClient){
      setError("No walletClient");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const txHash = await walletClient.writeContract({
        address: TASK_MANAGER_ADDRESS,
        abi: TASK_MANAGER_ABI,
        functionName: "createTask",
        args: [metadata, reward, resourceBased, parentTaskId, maxParticipants],
        chain: undefined,
        account: null
      });
      console.log("createTask txHash:", txHash);
    } catch(err:any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // joinTask
  async function joinTask(taskId: bigint){
    if(!walletClient){
      setError("No walletClient");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const txHash = await walletClient.writeContract({
        address: TASK_MANAGER_ADDRESS,
        abi: TASK_MANAGER_ABI,
        functionName: "joinTask",
        args: [taskId],
        chain: undefined,
        account: null
      });
      console.log("joinTask txHash:", txHash);
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
    createTask,
    joinTask
  };
}
