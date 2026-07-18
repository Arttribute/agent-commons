"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ReactFlow, { Background, Controls, ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import { Check, ExternalLink, Eye, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StepNode } from "@/components/workflows/editor/nodes/step-node";
import { ColoredEdge } from "@/components/workflows/editor/edges/colored-edge";
import { cn } from "@/lib/utils";

export type CopilotChange = {
  changeId: string;
  resourceId?: string | null;
  resourceType: "workflow" | "agent" | "task" | "tool" | "skill" | string;
  action: "create" | "update" | "delete";
  status: "pending" | "applied" | "rejected" | "reverted";
  title: string;
  description?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  diff?: {
    nodes?: { added?: string[]; removed?: string[]; modified?: string[] };
    edges?: { added?: string[]; removed?: string[]; modified?: string[] };
    fields?: string[];
    reviewNote?: string;
  };
  createdAt: string;
};

type ChangeAction = "accept" | "reject" | "revert";

export function CopilotChangeList({
  changes,
  compact = false,
  onChanged,
}: {
  changes: CopilotChange[];
  compact?: boolean;
  onChanged?: (
    change: CopilotChange,
    action?: ChangeAction,
    reason?: string,
  ) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<CopilotChange | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const act = async (change: CopilotChange, action: ChangeAction) => {
    setBusy(`${change.changeId}:${action}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/copilot/changes/${change.changeId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:
            action === "reject"
              ? JSON.stringify({ reason: reason.trim() || undefined })
              : undefined,
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "Could not update change",
        );
      }
      setRejecting(null);
      setReason("");
      setReviewing(null);
      await onChanged?.(payload.data, action, reason.trim() || undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update change",
      );
    } finally {
      setBusy(null);
    }
  };

  if (!changes.length) return null;

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {changes.map((change) => (
        <div
          key={change.changeId}
          className={cn(
            "rounded-xl border border-border bg-white shadow-card",
            compact ? "p-3" : "p-4",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{change.title}</p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                {change.action} {change.resourceType}
              </p>
            </div>
            <ChangeStatus status={change.status} />
          </div>

          <ChangeSummary change={change} />

          {rejecting === change.changeId && (
            <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-2.5">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Tell Copilot what to change (optional)"
                className="min-h-16 resize-none bg-background text-xs"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setRejecting(null);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={Boolean(busy)}
                  onClick={() => act(change, "reject")}
                >
                  Reject proposal
                </Button>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setReviewing(change)}
            >
              <Eye className="h-3 w-3" />
              Review
            </Button>
            {change.status === "pending" && rejecting !== change.changeId && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={Boolean(busy)}
                  onClick={() => setRejecting(change.changeId)}
                >
                  <X className="h-3 w-3" /> Reject
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
              </>
            )}
            {change.status === "applied" && (
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
            )}
          </div>
        </div>
      ))}

      <ChangeReviewDialog
        change={reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
      />
    </div>
  );
}

function ChangeStatus({ status }: { status: CopilotChange["status"] }) {
  const dot =
    status === "pending"
      ? "bg-amber-500"
      : status === "applied"
        ? "bg-emerald-500"
        : "bg-muted-foreground/40";
  return (
    <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] capitalize text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {status}
    </span>
  );
}

function ChangeSummary({ change }: { change: CopilotChange }) {
  if (change.resourceType === "workflow") {
    const parts = [
      ["added", change.diff?.nodes?.added],
      ["edited", change.diff?.nodes?.modified],
      ["removed", change.diff?.nodes?.removed],
    ].filter(([, ids]) => Array.isArray(ids) && ids.length) as Array<
      [string, string[]]
    >;
    return parts.length ? (
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        {parts.map(([label, ids]) => (
          <p key={label}>
            <span className="capitalize">{label}</span>: {ids.join(", ")}
          </p>
        ))}
      </div>
    ) : null;
  }
  const fields = change.diff?.fields ?? Object.keys(change.after ?? {});
  return fields.length ? (
    <p className="mt-2 text-xs text-muted-foreground">
      {change.action === "create" ? "Includes" : "Changes"}: {fields.join(", ")}
    </p>
  ) : null;
}

function ChangeReviewDialog({
  change,
  onOpenChange,
}: {
  change: CopilotChange | null;
  onOpenChange: (open: boolean) => void;
}) {
  const studioUrl = change
    ? resourceUrl(change.resourceType, change.resourceId)
    : null;
  return (
    <Dialog open={Boolean(change)} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[88vh] overflow-hidden",
          change?.resourceType === "workflow" && "max-w-[min(1100px,94vw)]",
        )}
      >
        {change && (
          <>
            <DialogHeader>
              <DialogTitle>{change.title}</DialogTitle>
              <DialogDescription>
                Review the complete proposed {change.resourceType} before
                applying it.
              </DialogDescription>
            </DialogHeader>
            {change.resourceType === "workflow" ? (
              <WorkflowPreview definition={change.after?.definition} />
            ) : (
              <ResourcePreview change={change} />
            )}
            {studioUrl && change.resourceId && (
              <div className="flex justify-end border-t pt-3">
                <Button variant="ghost" size="sm" asChild className="gap-1.5">
                  <Link href={studioUrl}>
                    Open current {change.resourceType}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const nodeTypes = {
  tool: StepNode,
  agent_processor: StepNode,
  workflow: StepNode,
  condition: StepNode,
  transform: StepNode,
  loop: StepNode,
  human_approval: StepNode,
  input: StepNode,
  output: StepNode,
};
const edgeTypes = { colored: ColoredEdge };

function WorkflowPreview({ definition }: { definition?: Record<string, any> }) {
  const nodes = useMemo(
    () =>
      (definition?.nodes ?? []).map((node: any, index: number) => ({
        ...node,
        position: node.position ?? { x: index * 220, y: 100 },
        draggable: false,
        selectable: false,
        data: {
          ...(node.data ?? {}),
          label: node.label ?? node.data?.label ?? node.id,
          nodeType: node.type,
          toolName: node.toolName,
          agentAvatar: node.agentAvatar,
          inputs: node.config?.inputPorts ?? node.data?.inputs,
          outputs: node.config?.outputPorts ?? node.data?.outputs,
        },
      })),
    [definition],
  );
  const edges = useMemo(
    () =>
      (definition?.edges ?? []).map((edge: any) => ({
        ...edge,
        type: "colored",
        animated: false,
        selectable: false,
      })),
    [definition],
  );
  return (
    <div className="copilot-workflow-preview pointer-events-auto h-[min(62vh,620px)] overflow-hidden rounded-xl border bg-muted/20">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={15} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

function ResourcePreview({ change }: { change: CopilotChange }) {
  const before = change.before ?? {};
  const after = change.after ?? {};
  return (
    <div className="max-h-[62vh] space-y-2 overflow-y-auto rounded-xl border p-3">
      {Object.entries(after).map(([key, value]) => {
        const changed = JSON.stringify(before[key]) !== JSON.stringify(value);
        return (
          <div
            key={key}
            className="grid gap-1 border-b py-2 last:border-0 sm:grid-cols-[140px_1fr]"
          >
            <p className="text-xs font-medium capitalize text-muted-foreground">
              {key.replace(/([A-Z])/g, " $1")}
            </p>
            <div className="min-w-0 text-sm">
              {change.action === "update" &&
                changed &&
                before[key] !== undefined && (
                  <p className="mb-1 break-words text-xs text-muted-foreground line-through">
                    {formatValue(before[key])}
                  </p>
                )}
              <p className="break-words">{formatValue(value)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatValue(value: any) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function resourceUrl(type: string, id?: string | null) {
  const plural: Record<string, string> = {
    agent: "agents",
    workflow: "workflows",
    task: "tasks",
    tool: "tools",
    skill: "skills",
  };
  const segment = plural[type];
  if (!segment) return null;
  return `/studio/${segment}${id ? `/${encodeURIComponent(id)}` : ""}`;
}
