"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { WorkflowExecution } from "@/types/workflow";
import { WorkflowResult } from "@/components/workflows/result/workflow-result";
import { AlertTriangle, CheckCircle2, Clock3, Copy, Loader2, RefreshCw, Search, XCircle } from "lucide-react";

type WorkflowRunsPanelProps = {
  workflowId: string;
  refreshKey?: string;
};

type TimelineFilter = "all" | "hour" | "day" | "week";
type StatusFilter = "all" | WorkflowExecution["status"];

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "running":
    case "pending":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />;
    default:
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  }
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "running" || status === "pending") return "secondary";
  return "outline";
}

function formatTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function durationMs(run: WorkflowExecution) {
  if (!run.startedAt) return undefined;
  const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  return Math.max(0, end - new Date(run.startedAt).getTime());
}

function formatDuration(ms?: number) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function stringify(value: any) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function withinTimeline(run: WorkflowExecution, timeline: TimelineFilter) {
  if (timeline === "all") return true;
  const started = new Date(run.startedAt).getTime();
  const now = Date.now();
  const windows: Record<Exclude<TimelineFilter, "all">, number> = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
  };
  return now - started <= windows[timeline];
}

export function WorkflowRunsPanel({ workflowId, refreshKey }: WorkflowRunsPanelProps) {
  const [runs, setRuns] = useState<WorkflowExecution[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [timeline, setTimeline] = useState<TimelineFilter>("day");
  const [loading, setLoading] = useState(false);

  const selected = runs.find((run) => run.executionId === selectedId) ?? runs[0];

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/executions?limit=75`, { cache: "no-store" });
      const data = await res.json();
      const nextRuns = Array.isArray(data) ? data : data.data || [];
      setRuns(nextRuns);
      setSelectedId((current) => current ?? nextRuns[0]?.executionId ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns().catch(() => undefined);
  }, [workflowId, refreshKey]);

  const filteredRuns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (status !== "all" && run.status !== status) return false;
      if (!withinTimeline(run, timeline)) return false;
      if (!needle) return true;
      const haystack = [
        run.executionId,
        run.status,
        run.errorMessage,
        run.error,
        stringify((run as any).inputData),
        stringify(run.outputData ?? run.result),
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [runs, query, status, timeline]);

  const selectedSteps = selected?.nodeResults ?? selected?.stepResults ?? {};

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search runs..."
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => loadRuns()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value={timeline} onValueChange={(value) => setTimeline(value as TimelineFilter)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hour">Last hour</SelectItem>
              <SelectItem value="day">Last day</SelectItem>
              <SelectItem value="week">Last week</SelectItem>
              <SelectItem value="all">All runs</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="awaiting_approval">Awaiting approval</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,45%)_1fr]">
        <ScrollArea className="border-b border-border">
          <div className="py-1">
            {filteredRuns.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No workflow runs match these filters.</div>
            ) : (
              filteredRuns.map((run) => {
                const active = run.executionId === selected?.executionId;
                return (
                  <button
                    key={run.executionId}
                    type="button"
                    onClick={() => setSelectedId(run.executionId)}
                    className={`grid w-full grid-cols-[92px_1fr_auto] items-center gap-2 border-l-2 px-3 py-2 text-left text-xs transition-colors ${
                      active
                        ? "border-primary bg-muted"
                        : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">{formatTime(run.startedAt)}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        {statusIcon(run.status)}
                        <span className="truncate font-medium">{run.executionId.slice(0, 8)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {run.errorMessage || run.error || formatDuration(durationMs(run))}
                      </span>
                    </span>
                    <Badge variant={statusVariant(run.status)} className="text-[10px]">
                      {run.status.replace("_", " ")}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        <ScrollArea>
          {selected ? (
            <div className="space-y-4 p-4 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {statusIcon(selected.status)}
                    <h4 className="truncate font-semibold">Run {selected.executionId.slice(0, 8)}</h4>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatTime(selected.startedAt)} · {formatDuration(durationMs(selected))}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => navigator.clipboard?.writeText(selected.executionId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-[92px_1fr] gap-y-2 text-[11px]">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={statusVariant(selected.status)} className="w-fit text-[10px]">{selected.status.replace("_", " ")}</Badge>
                <span className="text-muted-foreground">Agent</span>
                <code className="truncate font-mono">{(selected as any).agentId || "manual"}</code>
                <span className="text-muted-foreground">Started</span>
                <span>{formatTime(selected.startedAt)}</span>
                <span className="text-muted-foreground">Completed</span>
                <span>{formatTime(selected.completedAt)}</span>
              </div>

              {(selected.errorMessage || selected.error) && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="mb-1 font-medium text-destructive">Error</p>
                  <p className="break-words text-destructive/80">{selected.errorMessage || selected.error}</p>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 font-medium">
                  <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                  Node Events
                </div>
                <div className="space-y-1.5">
                  {Object.entries(selectedSteps).map(([nodeId, step]: [string, any]) => (
                    <div key={nodeId} className="rounded-md border border-border bg-muted/30 p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {statusIcon(step.status === "success" ? "completed" : step.status === "error" ? "failed" : "pending")}
                          <code className="truncate font-mono text-[11px]">{nodeId}</code>
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatDuration(step.duration)}</span>
                      </div>
                      {step.error ? (
                        <p className="break-words text-[11px] text-destructive">{step.error}</p>
                      ) : (
                        <WorkflowResult value={step.value} raw={step.output} label={nodeId} compact />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">Input</p>
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-[10px]">
                  {stringify((selected as any).inputData)}
                </pre>
              </div>

              <div className="space-y-2">
                <p className="font-medium">Output</p>
                <WorkflowResult raw={selected.outputData ?? selected.result} compact />
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground">Select a workflow run to inspect details.</div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
