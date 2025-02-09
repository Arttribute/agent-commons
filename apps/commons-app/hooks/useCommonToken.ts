"use client";
import { useState } from "react";
import { COMMON_TOKEN_ABI } from "@/lib/abis/CommonTokenABI";
import { COMMON_TOKEN_ADDRESS } from "@/lib/addresses";
import { PublicClient, WalletClient, parseUnits } from "viem";

/**
 * Provide read/write operations for CommonToken.
 */
export function useCommonToken(
  publicClient: PublicClient | null,
  walletClient: WalletClient | null
) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // READ: balanceOf
  async function balanceOf(addr: `0x${string}`) {
    if (!publicClient) {
      setError("No publicClient available");
      return 0n;
    }
    try {
      const bal = (await publicClient.readContract({
        address: COMMON_TOKEN_ADDRESS as `0x${string}`,
        abi: COMMON_TOKEN_ABI,
        functionName: "balanceOf",
        args: [addr],
      })) as bigint;
      return bal;
    } catch (err: any) {
      setError(err.message);
      return 0n;
    }
  }

  // WRITE: transfer
  async function transfer(recipient: `0x${string}`, amountInWei: bigint) {
    if (!walletClient) {
      setError("No walletClient available");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const addresses = await walletClient.getAddresses();
      if (!addresses || addresses.length === 0) {
        throw new Error(
          "No connected account found. Please connect your wallet."
        );
      }
      const account = addresses[0];
      const txHash = await walletClient.writeContract({
        address: COMMON_TOKEN_ADDRESS as `0x${string}`,
        abi: COMMON_TOKEN_ABI,
        functionName: "transfer",
        args: [recipient, amountInWei],
        chain: undefined,
        account, // This must be a valid Ethereum address
      });
      console.log("transfer txHash:", txHash);
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // WRITE: mint
  async function mint(to: `0x${string}`, amountInWei: bigint) {
    if (!walletClient) {
      setError("No walletClient available");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [address] = await walletClient.getAddresses();
      const txHash = await walletClient.writeContract({
        address: COMMON_TOKEN_ADDRESS.toLowerCase() as `0x${string}`,
        abi: COMMON_TOKEN_ABI,
        functionName: "mint",
        chain: undefined,
        account: address,
      });
      console.log("mint txHash:", txHash);
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // WRITE: burn
  async function burn(from: `0x${string}`, amountInWei: bigint) {
    if (!walletClient) {
      setError("No walletClient available");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const txHash = await walletClient.writeContract({
        address: COMMON_TOKEN_ADDRESS as `0x${string}`,
        abi: COMMON_TOKEN_ABI,
        functionName: "burn",
        args: [from, amountInWei],
        chain: undefined,
        account: null,
      });
      console.log("burn txHash:", txHash);
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // WRITE: buyCommonToken (send ETH to contract)
  async function buyCommonToken(amountInCommon: string) {
    if (!walletClient) {
      setError("No walletClient available");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Convert COMMON$ amount to ETH equivalent and then to Wei (bigint)
      const amountInWei = BigInt(parseUnits(amountInCommon, 18)) / 100000n;
      const [address] = await walletClient.getAddresses();
      const txHash = await walletClient.sendTransaction({
        to: COMMON_TOKEN_ADDRESS.toLowerCase() as `0x${string}`, // Ensure the address is lowercase
        value: amountInWei,
        account: address,
        chain: undefined,
      });

      console.log("buyCommonToken txHash:", txHash);
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }
  return {
    error,
    loading,
    balanceOf,
    transfer,
    mint,
    burn,
    buyCommonToken,
  };
}
