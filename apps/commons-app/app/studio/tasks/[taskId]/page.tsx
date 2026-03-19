"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  XCircle,
  Clock,
  Play,
  Trash2,
  Loader2,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import AppBar from "@/components/layout/app-bar";
import { useTaskStream } from "@/hooks/use-tasks";
import type { Task } from "@agent-commons/sdk";

// ── Status helpers ─────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-orange-100 text-orange-700",
};

const statusIcons: Record<string, React.ElementType> = {
  pending: Circle,
  running: Clock,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
};

// ── Result renderer ────────────────────────────────────────────────────────────

function ResultContent({ result }: { result: any }) {
  if (result === null || result === undefined) return null;
  if (typeof result === "string") {
    return <p className="text-sm whitespace-pre-wrap">{result}</p>;
  }
  return (
    <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

// ── Context renderer ───────────────────────────────────────────────────────────

function ContextSection({ context }: { context: Record<string, any> }) {
  const entries = Object.entries(context);
  if (entries.length === 0) return null;
  return (
    <dl className="space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-3 gap-2 text-sm">
          <dt className="text-muted-foreground font-medium truncate col-span-1">{key}</dt>
          <dd className="col-span-2 break-all">
            {typeof value === "object"
              ? <span className="font-mono text-xs">{JSON.stringify(value)}</span>
              : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Live status card ───────────────────────────────────────────────────────────

function LiveStatusCard({ taskId }: { taskId: string }) {
  const { status, progress, done, error } = useTaskStream(taskId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          Live Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : done ? (
          <p className="text-xs text-muted-foreground">Stream ended</p>
        ) : (
          <>
            {status && (
              <p className="text-xs text-muted-foreground capitalize">{status}</p>
            )}
            {progress > 0 && (
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            )}
            {!status && (
              <p className="text-xs text-muted-foreground">Waiting for updates…</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Timing row helper ─────────────────────────────────────────────────────────

function TimingRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{new Date(value).toLocaleString()}</span>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-72" />
      <div className="grid grid-cols-3 gap-6 mt-4">
        <div className="col-span-2 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) { setTask(null); return; }
      const data = await res.json();
      setTask(data.data ?? data ?? null);
    } catch {
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Initial load
  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Poll while running
  useEffect(() => {
    if (!task || task.status !== "running") return;
    const interval = setInterval(fetchTask, 3000);
    return () => clearInterval(interval);
  }, [task?.status, fetchTask]);

  // Fetch agent name
  useEffect(() => {
    if (!task?.agentId) return;
    fetch(`/api/agents/${task.agentId}`)
      .then((r) => r.json())
      .then((d) => {
        const name = d?.data?.name ?? d?.name ?? null;
        setAgentName(name);
      })
      .catch(() => {});
  }, [task?.agentId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleExecute = async () => {
    if (!task) return;
    setActionLoading("execute");
    try {
      await fetch(`/api/tasks/${task.taskId}/execute`, { method: "POST" });
      await fetchTask();
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!task) return;
    setActionLoading("cancel");
    try {
      await fetch(`/api/tasks/${task.taskId}/cancel`, { method: "POST" });
      await fetchTask();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm("Delete this task? This action cannot be undone.")) return;
    setActionLoading("delete");
    try {
      await fetch(`/api/tasks/${task.taskId}`, { method: "DELETE" });
      router.push("/studio/tasks");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <AppBar />
        <div className="mt-12">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div>
        <AppBar />
        <div className="mt-12 flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground text-sm">Task not found.</p>
          <Button variant="outline" size="sm" onClick={() => router.push("/studio/tasks")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tasks
          </Button>
        </div>
      </div>
    );
  }

  const StatusIcon = statusIcons[task.status] ?? Circle;
  const t = task as any; // access extra fields safely

  return (
    <div>
      <AppBar />
      <div className="mt-12 max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="mt-0.5 shrink-0"
              onClick={() => router.push("/studio/tasks")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold leading-tight">{task.title}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge className={`text-xs ${statusColors[task.status]}`}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {task.status}
                </Badge>
                {t.isRecurring && (
                  <Badge variant="outline" className="text-xs">Recurring</Badge>
                )}
                {task.executionMode === "workflow" && (
                  <Badge variant="outline" className="text-xs">Workflow</Badge>
                )}
                {(task.priority ?? 0) > 0 && (
                  <Badge variant="outline" className="text-xs">Priority {task.priority}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {task.status === "pending" && (
              <Button
                size="sm"
                variant="default"
                onClick={handleExecute}
                disabled={!!actionLoading}
              >
                {actionLoading === "execute" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Execute
              </Button>
            )}
            {task.status === "running" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={!!actionLoading}
              >
                {actionLoading === "cancel" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={!!actionLoading}
            >
              {actionLoading === "delete" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </div>
        </div>

        <Separator />

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* ── Left column (2/3) ── */}
          <div className="col-span-2 space-y-5">

            {/* Description */}
            {task.description && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Description
                </h2>
                <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
              </section>
            )}

            {/* Context */}
            {t.context && Object.keys(t.context).length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Context
                </h2>
                <Card>
                  <CardContent className="pt-4">
                    <ContextSection context={t.context} />
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Result Content */}
            {(task.status === "completed" || task.status === "failed") && t.resultContent !== undefined && t.resultContent !== null && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Result
                </h2>
                <Card>
                  <CardContent className="pt-4">
                    <ResultContent result={t.resultContent} />
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Summary */}
            {t.summary && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Summary
                </h2>
                <p className="text-sm text-foreground whitespace-pre-wrap">{t.summary}</p>
              </section>
            )}

            {/* Error */}
            {task.status === "failed" && t.errorMessage && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Error
                </h2>
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-red-700 whitespace-pre-wrap">{t.errorMessage}</p>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Empty state */}
            {!task.description && !t.context && t.resultContent === undefined && !t.summary && !t.errorMessage && (
              <div className="flex items-center justify-center h-40 rounded-lg border border-dashed text-center">
                <p className="text-sm text-muted-foreground">No details available for this task.</p>
              </div>
            )}
          </div>

          {/* ── Right column (1/3) ── */}
          <div className="space-y-4">

            {/* Live status (running only) */}
            {task.status === "running" && <LiveStatusCard taskId={task.taskId} />}

            {/* Details card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground">Agent</span>
                  <span className="font-medium">{agentName ?? task.agentId ?? "—"}</span>
                </div>
                {task.sessionId && (
                  <div className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground">Session</span>
                    <span className="font-mono text-[11px] truncate max-w-[120px]">{task.sessionId}</span>
                  </div>
                )}
                {task.executionMode && (
                  <div className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground">Execution Mode</span>
                    <span className="capitalize">{task.executionMode}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground">Priority</span>
                  <span>{task.priority ?? 0}</span>
                </div>
                {t.cronExpression && (
                  <div className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground">Cron</span>
                    <span className="font-mono text-[11px]">{t.cronExpression}</span>
                  </div>
                )}
                {t.tools && (t.tools as string[]).length > 0 && (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground mb-1.5">Tools</p>
                    <div className="flex flex-wrap gap-1">
                      {(t.tools as string[]).map((tool) => (
                        <Badge key={tool} variant="outline" className="text-[11px] px-1.5 py-0 flex items-center gap-1">
                          <Zap className="h-2.5 w-2.5" />
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Timing card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Timing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5">
                <TimingRow label="Created" value={task.createdAt} />
                <TimingRow label="Scheduled" value={t.scheduledFor} />
                <TimingRow label="Started" value={t.actualStart} />
                <TimingRow label="Completed" value={t.actualEnd ?? t.completedAt} />
                <TimingRow label="Last Run" value={t.lastRunAt} />
                <TimingRow label="Next Run" value={t.nextRunAt} />
                {t.estimatedDuration && (
                  <div className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground">Est. Duration</span>
                    <span>{t.estimatedDuration}s</span>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
