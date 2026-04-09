"use client";

import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/layout/app-bar";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAgents } from "@/hooks/use-agents";
import { useState, useEffect, useCallback } from "react";
import { Loader2, BarChart2, TrendingUp, Zap, DollarSign, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UsageData {
  agentId: string;
  agentName: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatCard({ label, value, icon: Icon, sub }: {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function UsagePage() {
  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";
  const { agents, loading: loadingAgents } = useAgents(userAddress || undefined);

  const [usageRows, setUsageRows] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<"7d" | "30d" | "all">("30d");

  const fetchUsage = useCallback(async () => {
    if (!agents.length) return;
    setLoading(true);
    const from = range === "7d"
      ? new Date(Date.now() - 7 * 86400_000).toISOString()
      : range === "30d"
      ? new Date(Date.now() - 30 * 86400_000).toISOString()
      : undefined;

    try {
      const results = await Promise.allSettled(
        agents.map((a: any) => {
          const qs = from ? `?from=${encodeURIComponent(from)}` : "";
          return fetch(`/api/usage/agents/${a.agentId}${qs}`)
            .then((r) => r.json())
            .then((d) => ({
              agentId: a.agentId,
              agentName: a.name || a.agentId.slice(0, 12),
              ...(d.data ?? { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, totalCostUsd: 0, callCount: 0 }),
            }));
        })
      );
      const rows: UsageData[] = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<UsageData>).value)
        .filter((r) => r.totalTokens > 0 || r.callCount > 0);
      rows.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
      setUsageRows(rows);
    } finally {
      setLoading(false);
    }
  }, [agents, range]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const totals = usageRows.reduce(
    (acc, r) => ({
      tokens: acc.tokens + r.totalTokens,
      cost: acc.cost + r.totalCostUsd,
      calls: acc.calls + r.callCount,
    }),
    { tokens: 0, cost: 0, calls: 0 }
  );

  const maxCost = Math.max(...usageRows.map((r) => r.totalCostUsd), 0.0001);

  return (
    <div className="min-h-screen bg-background">
      <AppBar />
      <div className="mt-12 flex">
        <DashboardSideBar username={userAddress} />
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Usage</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Token consumption and cost breakdown per agent
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(["7d", "30d", "all"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                    range === r
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r === "all" ? "All time" : `Last ${r}`}
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={fetchUsage}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
            </div>
          </div>

          <div className="px-6 py-6 space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="Total tokens"
                value={fmt(totals.tokens)}
                icon={Zap}
                sub="across all agents"
              />
              <StatCard
                label="Total cost"
                value={`$${totals.cost.toFixed(4)}`}
                icon={DollarSign}
                sub="USD"
              />
              <StatCard
                label="LLM calls"
                value={fmt(totals.calls)}
                icon={TrendingUp}
                sub="total requests"
              />
            </div>

            {/* Per-agent table */}
            {loadingAgents || loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : usageRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <BarChart2 className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No usage data yet</p>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Agent</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Calls</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Input</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Output</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total tokens</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Cost (USD)</th>
                      <th className="px-4 py-2.5 w-32"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {usageRows.map((row) => (
                      <tr key={row.agentId} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{row.agentName}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{row.agentId.slice(0, 12)}…</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(row.callCount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmt(row.totalInputTokens)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmt(row.totalOutputTokens)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs font-medium">{fmt(row.totalTokens)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs font-medium">${row.totalCostUsd.toFixed(4)}</td>
                        <td className="px-4 py-3">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-foreground rounded-full"
                              style={{ width: `${(row.totalCostUsd / maxCost) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
