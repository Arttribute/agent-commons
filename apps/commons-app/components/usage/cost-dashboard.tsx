"use client";

import { useEffect, useState } from "react";
import { commons } from "@/lib/commons";
import { UsageAggregation, UsageEvent } from "@agent-commons/sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, Zap, TrendingUp, Clock } from "lucide-react";

interface CostDashboardProps {
  agentId: string;
  /** Optional ISO date strings to filter by time range */
  from?: string;
  to?: string;
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EventRow({ event }: { event: UsageEvent }) {
  const date = new Date(event.createdAt).toLocaleString();
  const cost =
    event.costUsd > 0
      ? event.costUsd < 0.001
        ? "<$0.001"
        : `$${event.costUsd.toFixed(4)}`
      : "$0.00";

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <Badge variant="outline" className="shrink-0 font-mono text-xs">
          {event.modelId}
        </Badge>
        <span className="text-muted-foreground truncate">{date}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-right">
        <span className="text-muted-foreground">
          {event.totalTokens.toLocaleString()} tok
        </span>
        <span className="font-medium w-16">{cost}</span>
        {event.durationMs && (
          <span className="text-muted-foreground w-16">
            {event.durationMs < 1000
              ? `${event.durationMs}ms`
              : `${(event.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {event.isByok && (
          <Badge variant="secondary" className="text-xs">
            BYOK
          </Badge>
        )}
      </div>
    </div>
  );
}

export function CostDashboard({ agentId, from, to }: CostDashboardProps) {
  const [data, setData] = useState<UsageAggregation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await commons.usage.getAgentUsage(agentId, { from, to });
        setData(res.data);
      } catch (err: any) {
        setError(err.message ?? "Failed to load usage data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentId, from, to]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive py-4">
        Error loading usage: {error}
      </p>
    );
  }

  if (!data) return null;

  const totalCostDisplay =
    data.totalCostUsd > 0
      ? data.totalCostUsd < 0.01
        ? `$${data.totalCostUsd.toFixed(5)}`
        : `$${data.totalCostUsd.toFixed(4)}`
      : "$0.00";

  const avgTokens =
    data.callCount > 0
      ? Math.round(Number(data.totalTokens) / Number(data.callCount))
      : 0;

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Cost"
          value={totalCostDisplay}
          subtitle={`${Number(data.callCount)} LLM calls`}
          icon={<Coins className="h-4 w-4" />}
        />
        <StatCard
          title="Total Tokens"
          value={Number(data.totalTokens).toLocaleString()}
          subtitle={`${Number(data.totalInputTokens).toLocaleString()} in · ${Number(data.totalOutputTokens).toLocaleString()} out`}
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          title="LLM Calls"
          value={Number(data.callCount).toLocaleString()}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Avg Tokens/Call"
          value={avgTokens.toLocaleString()}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Event log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent LLM Calls</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.events.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 pb-4">
              No usage recorded yet.
            </p>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="px-2 pb-2">
                {data.events.map((event) => (
                  <EventRow key={event.eventId} event={event} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
