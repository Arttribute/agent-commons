"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgents } from "@/hooks/use-agents";
import {
  Loader2,
  BarChart2,
  TrendingUp,
  Zap,
  DollarSign,
  RefreshCw,
} from "lucide-react";
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

/** Compact number: 7.5M, 754.6B, etc. */
function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Full value for hover tooltips. */
function exact(n: number): string {
  return n.toLocaleString();
}

function StatCard({
  label,
  value,
  title,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  title: string;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p
        title={title}
        className="truncate text-2xl font-semibold tabular-nums tracking-tight"
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function UsageSection({ walletAddress }: { walletAddress: string }) {
  const { agents, loading: loadingAgents } = useAgents(
    walletAddress || undefined,
  );

  const [usageRows, setUsageRows] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<"7d" | "30d" | "all">("30d");

  const fetchUsage = useCallback(async () => {
    if (!agents.length) return;
    setLoading(true);
    const from =
      range === "7d"
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
              ...(d.data ?? {
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalTokens: 0,
                totalCostUsd: 0,
                callCount: 0,
              }),
            }));
        }),
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

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const totals = usageRows.reduce(
    (acc, r) => ({
      tokens: acc.tokens + r.totalTokens,
      cost: acc.cost + r.totalCostUsd,
      calls: acc.calls + r.callCount,
    }),
    { tokens: 0, cost: 0, calls: 0 },
  );

  const maxCost = Math.max(...usageRows.map((r) => r.totalCostUsd), 0.0001);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Usage</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Token consumption and cost per agent
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["7d", "30d", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                range === r
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total tokens"
          value={fmt(totals.tokens)}
          title={exact(totals.tokens)}
          icon={Zap}
          sub="across all agents"
        />
        <StatCard
          label="Total cost"
          value={`$${totals.cost.toFixed(4)}`}
          title={`$${totals.cost.toFixed(6)}`}
          icon={DollarSign}
          sub="USD"
        />
        <StatCard
          label="LLM calls"
          value={fmt(totals.calls)}
          title={exact(totals.calls)}
          icon={TrendingUp}
          sub="total requests"
        />
      </div>

      {/* Per-agent table */}
      {loadingAgents || loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : usageRows.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2">
          <BarChart2 className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No usage data yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Agent
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Calls
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Input
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Output
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Tokens
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Cost
                </th>
                <th className="w-24 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {usageRows.map((row) => (
                <tr
                  key={row.agentId}
                  className="transition-colors hover:bg-muted/20"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium">{row.agentName}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {row.agentId.slice(0, 12)}…
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">
                    <span title={exact(row.callCount)}>
                      {fmt(row.callCount)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                    <span title={exact(row.totalInputTokens)}>
                      {fmt(row.totalInputTokens)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                    <span title={exact(row.totalOutputTokens)}>
                      {fmt(row.totalOutputTokens)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs font-medium tabular-nums">
                    <span title={exact(row.totalTokens)}>
                      {fmt(row.totalTokens)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs font-medium tabular-nums">
                    <span title={`$${row.totalCostUsd.toFixed(6)}`}>
                      ${row.totalCostUsd.toFixed(4)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/70"
                        style={{
                          width: `${(row.totalCostUsd / maxCost) * 100}%`,
                        }}
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
  );
}
