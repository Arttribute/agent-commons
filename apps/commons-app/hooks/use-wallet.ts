"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { AgentWallet, WalletBalance } from "@agent-commons/sdk";

async function readApiJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.error?.message ??
      data?.error ??
      response.statusText ??
      "Request failed";
    throw new Error(message);
  }
  return data as T;
}

function unwrapData<T>(value: T | { data?: T }): T {
  if (value && typeof value === "object" && "data" in value) {
    const wrapped = value as { data?: T };
    if (wrapped.data) return wrapped.data;
  }
  return value as T;
}

import { parseWalletBalance } from "@/lib/wallet-networks";

export function useAgentWallet(agentId: string | undefined) {
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const generation = useRef(0);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    const current = ++generation.current;
    setWallet(null);
    setBalance(null);
    setBalanceError(null);
    setBalanceLoading(false);
    setLoading(false);
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/wallets/agent/${encodeURIComponent(agentId)}`,
      );
      const wallets = await readApiJson<
        AgentWallet[] | { data?: AgentWallet[] }
      >(response);
      const list = Array.isArray(wallets) ? wallets : (wallets.data ?? []);
      const primary =
        list.find((candidate) => candidate.isActive) ??
        list.find(
          (candidate) => candidate.label?.toLowerCase() === "primary",
        ) ??
        list[0] ??
        null;
      if (generation.current === current) setWallet(primary);
    } catch (e: any) {
      if (generation.current === current)
        setError(e.message ?? "Failed to load wallet");
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [agentId]);

  const fetchBalance = useCallback(async () => {
    if (!wallet?.id || wallet.agentId !== agentId) return;
    const current = generation.current;
    setBalance(null);
    setBalanceError(null);
    setBalanceLoading(true);
    try {
      const response = await fetch(
        `/api/wallets/${encodeURIComponent(wallet.id)}/balance?chainId=${encodeURIComponent(wallet.chainId)}`,
      );
      const data = await readApiJson<WalletBalance | { data?: WalletBalance }>(
        response,
      );
      const parsed = parseWalletBalance(data, wallet.chainId);
      if (parsed.address.toLowerCase() !== wallet.address.toLowerCase())
        throw new Error("Wallet mismatch");
      if (generation.current === current) setBalance(parsed);
    } catch {
      if (generation.current === current) {
        setBalance(null);
        setBalanceError("Balance unavailable");
      }
    } finally {
      if (generation.current === current) setBalanceLoading(false);
    }
  }, [agentId, wallet?.id, wallet?.agentId, wallet?.address, wallet?.chainId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const createWallet = useCallback(async () => {
    if (!agentId) return;
    const current = generation.current;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/wallets/agent/${encodeURIComponent(agentId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletType: "eoa", label: "Primary" }),
        },
      );
      const data = await readApiJson<AgentWallet | { data?: AgentWallet }>(
        response,
      );
      if (generation.current === current)
        setWallet(unwrapData<AgentWallet>(data));
    } catch (e: any) {
      if (generation.current === current)
        setError(e.message ?? "Failed to create wallet");
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [agentId]);

  return {
    wallet,
    balance,
    loading,
    balanceLoading,
    error,
    balanceError,
    refetch: fetchWallet,
    refetchBalance: fetchBalance,
    createWallet,
  };
}
