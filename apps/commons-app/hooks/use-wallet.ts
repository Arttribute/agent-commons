'use client';

import { useEffect, useState, useCallback } from 'react';
import type { AgentWallet, WalletBalance } from '@agent-commons/sdk';

async function readApiJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.error?.message ??
      data?.error ??
      response.statusText ??
      'Request failed';
    throw new Error(message);
  }
  return data as T;
}

function unwrapData<T>(value: T | { data?: T }): T {
  if (value && typeof value === 'object' && 'data' in value) {
    const wrapped = value as { data?: T };
    if (wrapped.data) return wrapped.data;
  }
  return value as T;
}

export function useAgentWallet(agentId: string | undefined) {
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/wallets/agent/${encodeURIComponent(agentId)}`);
      const wallets = await readApiJson<AgentWallet[] | { data?: AgentWallet[] }>(response);
      const list = Array.isArray(wallets) ? wallets : wallets.data ?? [];
      const primary =
        list.find((candidate) => candidate.isActive) ??
        list.find((candidate) => candidate.label?.toLowerCase() === 'primary') ??
        list[0] ??
        null;
      setWallet(primary);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const fetchBalance = useCallback(async () => {
    if (!wallet?.id) return;
    setBalanceLoading(true);
    try {
      const response = await fetch(`/api/wallets/${encodeURIComponent(wallet.id)}/balance`);
      const data = await readApiJson<WalletBalance | { data?: WalletBalance }>(response);
      setBalance(unwrapData<WalletBalance>(data));
    } catch {
      // Balance fetch is non-critical — silently ignore (RPC might be down)
    } finally {
      setBalanceLoading(false);
    }
  }, [wallet?.id]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);
  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const createWallet = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/wallets/agent/${encodeURIComponent(agentId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletType: 'eoa', label: 'Primary' }),
      });
      const data = await readApiJson<AgentWallet | { data?: AgentWallet }>(response);
      setWallet(unwrapData<AgentWallet>(data));
    } catch (e: any) {
      setError(e.message ?? 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  return { wallet, balance, loading, balanceLoading, error, refetch: fetchWallet, refetchBalance: fetchBalance, createWallet };
}
