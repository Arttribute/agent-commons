'use client';

import { useEffect, useState, useCallback } from 'react';
import { commons } from '@/lib/commons';
import type { AgentWallet, WalletBalance } from '@agent-commons/sdk';

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
      const res = await commons.wallets.primary(agentId);
      const w = (res as any)?.data ?? res;
      setWallet(w);
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
      const res = await commons.wallets.balance(wallet.id);
      const b = (res as any)?.data ?? res;
      setBalance(b);
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
      const res = await commons.wallets.create({ agentId, walletType: 'eoa', label: 'Primary' });
      const w = (res as any)?.data ?? res;
      setWallet(w);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  return { wallet, balance, loading, balanceLoading, error, refetch: fetchWallet, refetchBalance: fetchBalance, createWallet };
}
