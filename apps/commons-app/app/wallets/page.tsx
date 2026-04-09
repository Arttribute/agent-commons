"use client";

import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/layout/app-bar";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAgents } from "@/hooks/use-agents";
import { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  Loader2,
  Plus,
  RefreshCw,
  Copy,
  CheckCheck,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WalletRecord {
  walletId: string;
  agentId: string;
  address: string;
  network: string;
  isActive: boolean;
  isPrimary: boolean;
  createdAt: string;
}

interface WalletBalance {
  nativeBalance: string;
  usdcBalance: string;
  network: string;
}

function AgentWalletRow({ agent }: { agent: { agentId: string; name: string } }) {
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [balances, setBalances] = useState<Record<string, WalletBalance | null>>({});
  const [loadingBalance, setLoadingBalance] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wallets/agent/${agent.agentId}`);
      const data = await res.json();
      setWallets(data.data || []);
    } catch {
      setWallets([]);
    } finally {
      setLoading(false);
    }
  }, [agent.agentId]);

  useEffect(() => {
    if (expanded) fetchWallets();
  }, [expanded, fetchWallets]);

  const createWallet = async () => {
    setCreating(true);
    try {
      await fetch(`/api/wallets/agent/${agent.agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: "base-sepolia" }),
      });
      await fetchWallets();
    } finally {
      setCreating(false);
    }
  };

  const fetchBalance = async (walletId: string) => {
    setLoadingBalance((prev) => ({ ...prev, [walletId]: true }));
    try {
      const res = await fetch(`/api/wallets/${walletId}/balance`);
      const data = await res.json();
      setBalances((prev) => ({ ...prev, [walletId]: data.data || data }));
    } catch {
      setBalances((prev) => ({ ...prev, [walletId]: null }));
    } finally {
      setLoadingBalance((prev) => ({ ...prev, [walletId]: false }));
    }
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(address);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Agent header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-accent/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Bot className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">{agent.name}</p>
            <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
              {agent.agentId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && (
            <span className="text-xs text-muted-foreground">Click to manage wallets</span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Wallet list */}
      {expanded && (
        <div className="border-t border-border bg-background">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : wallets.length === 0 ? (
            <div className="px-4 py-6 flex flex-col items-center gap-3">
              <Wallet className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No wallets yet</p>
              <Button size="sm" onClick={createWallet} disabled={creating}>
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                )}
                Create Wallet
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {wallets.map((w) => {
                const bal = balances[w.walletId];
                const isLoadingBal = loadingBalance[w.walletId];
                return (
                  <div key={w.walletId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      {/* Address + badges */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs text-foreground truncate max-w-[200px] sm:max-w-xs">
                          {w.address}
                        </span>
                        <button
                          onClick={() => copyAddress(w.address)}
                          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                          title="Copy address"
                        >
                          {copied === w.address ? (
                            <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <a
                          href={`https://sepolia.basescan.org/address/${w.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                          title="View on explorer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {w.network || "base-sepolia"}
                        </Badge>
                        {w.isPrimary && (
                          <Badge className="text-[10px] bg-foreground text-background">
                            Primary
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Balance row */}
                    <div className="mt-2 flex items-center gap-4">
                      {bal ? (
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground">
                            ETH:{" "}
                            <span className="font-medium text-foreground">
                              {parseFloat(bal.nativeBalance || "0").toFixed(6)}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            USDC:{" "}
                            <span className="font-medium text-foreground">
                              {parseFloat(bal.usdcBalance || "0").toFixed(2)}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => fetchBalance(w.walletId)}
                          disabled={isLoadingBal}
                        >
                          {isLoadingBal ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="h-3 w-3 mr-1" />
                          )}
                          Check balance
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Create another */}
              <div className="px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={createWallet}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Add wallet
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WalletsPage() {
  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";
  const { agents, loading } = useAgents(userAddress || undefined);

  return (
    <div className="min-h-screen bg-background">
      <AppBar />
      <div className="mt-12 flex">
        <DashboardSideBar username={userAddress} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-background">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Wallets</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage on-chain wallets for your agents — view balances, create new wallets
              </p>
            </div>
          </div>

          <div className="px-6 py-6">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Wallet className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No agents yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Create an agent first, then you can assign it a wallet
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-w-3xl">
                {agents.map((agent: any) => (
                  <AgentWalletRow
                    key={agent.agentId}
                    agent={{ agentId: agent.agentId, name: agent.name || "Unnamed Agent" }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
