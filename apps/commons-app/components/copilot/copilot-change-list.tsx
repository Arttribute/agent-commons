"use client";

import { useState } from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CopilotChange = {
  changeId: string;
  resourceId?: string | null;
  resourceType: string;
  action: "create" | "update" | "delete";
  status: "pending" | "applied" | "rejected" | "reverted";
  title: string;
  description?: string | null;
  diff?: {
    nodes?: { added?: string[]; removed?: string[]; modified?: string[] };
    edges?: { added?: string[]; removed?: string[]; modified?: string[] };
  };
  createdAt: string;
};

export function CopilotChangeList({
  changes,
  compact = false,
  onChanged,
}: {
  changes: CopilotChange[];
  compact?: boolean;
  onChanged?: (change: CopilotChange) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (
    change: CopilotChange,
    action: "accept" | "reject" | "revert",
  ) => {
    setBusy(`${change.changeId}:${action}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/copilot/changes/${change.changeId}/${action}`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "Could not update change",
        );
      }
      await onChanged?.(payload.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update change",
      );
    } finally {
      setBusy(null);
    }
  };

  if (!changes.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
        No copilot changes to review.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {changes.map((change) => {
        const nodeDiff = change.diff?.nodes;
        const counts = [
          ["added", nodeDiff?.added?.length ?? 0, "text-emerald-700"],
          ["changed", nodeDiff?.modified?.length ?? 0, "text-amber-700"],
          ["removed", nodeDiff?.removed?.length ?? 0, "text-rose-700"],
        ] as const;
        return (
          <div
            key={change.changeId}
            className={cn(
              "rounded-xl border border-border bg-background shadow-sm",
              compact ? "p-3" : "p-4",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{change.title}</p>
                {change.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {change.description}
                  </p>
                )}
              </div>
              <Badge
                variant={change.status === "pending" ? "default" : "secondary"}
                className="shrink-0 capitalize"
              >
                {change.status}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="capitalize text-muted-foreground">
                {change.action}
              </span>
              {counts.map(([label, count, color]) =>
                count ? (
                  <span key={label} className={color}>
                    {count} {label}
                  </span>
                ) : null,
              )}
            </div>
            {change.status === "pending" && (
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={Boolean(busy)}
                  onClick={() => act(change, "reject")}
                >
                  {busy === `${change.changeId}:reject` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={Boolean(busy)}
                  onClick={() => act(change, "accept")}
                >
                  {busy === `${change.changeId}:accept` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Apply
                </Button>
              </div>
            )}
            {change.status === "applied" && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={Boolean(busy)}
                  onClick={() => act(change, "revert")}
                >
                  {busy === `${change.changeId}:revert` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Undo
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
