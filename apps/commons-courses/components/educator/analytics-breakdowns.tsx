"use client";

import { useState } from "react";
import { Card, EmptyState } from "@/components/ui/surface";
import { Segmented } from "@/components/ui/tabs";

type Row = { label: string; count: number };

/** One breakdown at a time, picked from a compact switcher. */
export function AnalyticsBreakdowns({ groups }: { groups: Array<{ key: string; label: string; rows: Row[] }> }) {
  const [active, setActive] = useState(groups[0]?.key || "");
  const group = groups.find((item) => item.key === active) || groups[0];
  const max = Math.max(1, ...(group?.rows || []).map((row) => row.count));
  if (!group) return null;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Segmented
          size="sm"
          items={groups.map(({ key, label }) => ({ value: key, label }))}
          value={group.key}
          onChange={setActive}
        />
      </div>
      {group.rows.length ? (
        <Card padded={false} className="divide-y divide-border">
          {group.rows.slice(0, 10).map((row) => (
            <div key={row.label} className="flex items-center gap-4 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
              <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block">
                <span
                  className="block h-full rounded-full bg-stone-800"
                  style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                />
              </span>
              <span className="w-10 text-right text-sm tabular-nums">{row.count}</span>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState title="No data yet" className="py-10" />
      )}
    </div>
  );
}

/** Funnel rates as a single compact card. */
export function FunnelCard({ items }: { items: Array<{ label: string; value: number }> }) {
  return (
    <Card className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-sm font-medium tabular-nums">{item.value}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-teal-400" style={{ width: `${Math.min(100, item.value)}%` }} />
          </div>
        </div>
      ))}
    </Card>
  );
}
