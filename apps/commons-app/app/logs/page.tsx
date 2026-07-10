"use client";

import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAgents } from "@/hooks/use-agents";
import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Wrench,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  source: "agent" | "workflow";
  action: string;
  status: string;
  message: string;
  timestamp: string;
  responseTime: number;
  agent: string;
  agentName?: string;
  workflowId?: string;
  workflowName?: string;
  sessionId: string;
  tools: {
    name: string;
    status: string;
    summary?: string;
    duration?: number;
  }[];
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success")
    return (
      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
    );
  if (status === "error")
    return <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />;
  if (status === "warning")
    return (
      <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
    );
  return <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
}

function normalizeWorkflowStatus(status: string) {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "awaiting_approval") return "warning";
  return "pending";
}

function elapsedMs(startedAt?: string, completedAt?: string) {
  if (!startedAt || !completedAt) return 0;
  return Math.max(
    0,
    new Date(completedAt).getTime() - new Date(startedAt).getTime(),
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const [open, setOpen] = useState(false);
  const hasTools = log.tools?.length > 0;

  return (
    <div className="border-b border-border/50 last:border-0">
      <div
        className={cn(
          "flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors",
          hasTools && "cursor-pointer",
        )}
        onClick={() => hasTools && setOpen((v) => !v)}
      >
        <StatusIcon status={log.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {log.action}
            </span>
            {log.agentName && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {log.agentName}
              </span>
            )}
            {log.workflowName && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {log.workflowName}
              </span>
            )}
            {log.sessionId && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {log.sessionId.slice(0, 8)}…
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {log.message}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 text-right">
          {log.responseTime > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {log.responseTime}ms
            </span>
          )}
          {hasTools && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Wrench className="h-3 w-3" />
              {log.tools.length}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
          </span>
          {hasTools &&
            (open ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            ))}
        </div>
      </div>
      {open && hasTools && (
        <div className="px-10 pb-2 space-y-1">
          {log.tools.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <StatusIcon status={t.status} />
              <span className="font-medium text-foreground">{t.name}</span>
              {t.summary && <span className="truncate">{t.summary}</span>}
              {t.duration && (
                <span className="ml-auto flex-shrink-0">{t.duration}ms</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LogsPage() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { agents, loading: loadingAgents } = useAgents(
    userAddress || undefined,
  );

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>("all");

  const fetchAllLogs = useCallback(async () => {
    setLoading(true);
    try {
      const agentResults = agents.length
        ? await Promise.allSettled(
            agents.map((a: any) =>
              fetch(`/api/logs/agents/${a.agentId}?limit=100`)
                .then((r) => r.json())
                .then((d) =>
                  (d.data ?? []).map((l: LogEntry) => ({
                    ...l,
                    source: "agent" as const,
                    agentName: a.name || a.agentId.slice(0, 8),
                  })),
                ),
            ),
          )
        : [];

      const workflowList = await fetch("/api/workflows", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
      const workflows = Array.isArray(workflowList)
        ? workflowList
        : (workflowList.data ?? []);
      const workflowResults = await Promise.allSettled(
        workflows.slice(0, 30).map((workflow: any) =>
          fetch(`/api/workflows/${workflow.workflowId}/executions?limit=50`)
            .then((r) => r.json())
            .then((executions) =>
              (Array.isArray(executions)
                ? executions
                : (executions.data ?? [])
              ).map((execution: any) => {
                const nodes = Object.entries(
                  execution.nodeResults || execution.stepResults || {},
                );
                return {
                  id: execution.executionId,
                  source: "workflow" as const,
                  action: "Workflow run",
                  status: normalizeWorkflowStatus(execution.status),
                  message:
                    execution.errorMessage ||
                    execution.error ||
                    execution.status,
                  timestamp:
                    execution.startedAt ||
                    execution.createdAt ||
                    new Date().toISOString(),
                  responseTime: elapsedMs(
                    execution.startedAt,
                    execution.completedAt,
                  ),
                  agent: execution.agentId || "",
                  workflowId: workflow.workflowId,
                  workflowName: workflow.name,
                  sessionId: execution.sessionId || "",
                  tools: nodes.map(([nodeId, step]: [string, any]) => ({
                    name: nodeId,
                    status:
                      step.status === "success"
                        ? "success"
                        : step.status === "error"
                          ? "error"
                          : "warning",
                    summary: step.error,
                    duration: step.duration,
                  })),
                } satisfies LogEntry;
              }),
            ),
        ),
      );

      const all: LogEntry[] = agentResults
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => (r as PromiseFulfilledResult<LogEntry[]>).value);
      all.push(
        ...workflowResults
          .filter((r) => r.status === "fulfilled")
          .flatMap((r) => (r as PromiseFulfilledResult<LogEntry[]>).value),
      );
      all.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      setLogs(all);
    } finally {
      setLoading(false);
    }
  }, [agents]);

  useEffect(() => {
    fetchAllLogs();
  }, [fetchAllLogs]);

  const filtered = logs.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
    if (
      selectedAgent !== "all" &&
      l.source === "agent" &&
      l.agent !== selectedAgent
    )
      return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        l.action.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        l.agentName?.toLowerCase().includes(q) ||
        l.workflowName?.toLowerCase().includes(q) ||
        false
      );
    }
    return true;
  });

  const isLoading = loadingAgents || loading;

  return (
    <div className="h-screen overflow-hidden bg-background">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <div className="flex-1 min-w-0 overflow-y-auto">
          {/* Header */}
          <PageHeader title="Logs" description="Agent and workflow activity">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs…"
                className="h-8 pl-8 text-sm w-56"
              />
            </div>
          </PageHeader>

          {/* Filters */}
          <div className="px-6 pt-3 pb-2 flex items-center gap-2 flex-wrap">
            {/* Status filter */}
            {["all", "success", "error", "warning"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  statusFilter === s
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <div className="w-px h-4 bg-border" />
            {["all", "agent", "workflow"].map((source) => (
              <button
                key={source}
                onClick={() => setSourceFilter(source)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  sourceFilter === source
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {source === "all"
                  ? "All sources"
                  : source === "agent"
                    ? "Agents"
                    : "Workflows"}
              </button>
            ))}
            <div className="w-px h-4 bg-border" />
            {/* Agent filter */}
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="h-6 text-xs bg-muted border-0 rounded px-2 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All agents</option>
              {agents.map((a: any) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.name || a.agentId.slice(0, 12)}
                </option>
              ))}
            </select>
            {!isLoading && (
              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} entries
              </span>
            )}
          </div>

          {/* Log list */}
          <div className="mx-6 border border-border rounded-lg overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <FileText className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {search || statusFilter !== "all"
                    ? "No matching logs"
                    : "No logs yet"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filtered.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
