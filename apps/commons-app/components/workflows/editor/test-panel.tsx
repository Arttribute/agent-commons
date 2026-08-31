"use client";

import { useState, useEffect } from "react";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { WorkflowExecution } from "@/types/workflow";
import { useWorkflowExecutionStream } from "@/hooks/use-workflows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowRunsPanel } from "./workflow-runs-panel";
import { WorkflowIntegrationsPanel } from "./workflow-integrations-panel";
import { WorkflowResult } from "@/components/workflows/result/workflow-result";
import { TrajectoryView } from "@/components/provenance/trajectory-view";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PanelRightClose,
  SquareTerminal,
  ShieldCheck,
} from "lucide-react";
import {
  extractWorkflowInputSchema,
  WorkflowInputSchema,
} from "@/lib/workflows/workflow-input-schema";
import { formatType, getTypeColor } from "@/lib/workflows/type-mapping";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TestPanelProps {
  workflowId: string;
}

export function TestPanel({ workflowId }: TestPanelProps) {
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [inputSchema, setInputSchema] = useState<WorkflowInputSchema | null>(null);
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [pendingExecutionId, setPendingExecutionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalReason, setApprovalReason] = useState("");
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("run");
  const [open, setOpen] = useState(false);
  const { nodes, edges } = useWorkflowStore();

  const { execution: streamExecution, done: streamDone } = useWorkflowExecutionStream(
    pendingExecutionId ? workflowId : undefined,
    pendingExecutionId
  );

  useEffect(() => {
    if (!pendingExecutionId) return;
    if (streamExecution.status) {
      setExecution((prev) => (prev ? { ...prev, ...(streamExecution as any) } : null));
    }
    if (streamDone) setPendingExecutionId(undefined);
  }, [streamExecution, streamDone, pendingExecutionId]);

  useEffect(() => {
    if (nodes.length > 0) {
      const schema = extractWorkflowInputSchema({ nodes, edges, startNodeId: undefined });
      setInputSchema(schema);
      if (schema) {
        const initial: Record<string, any> = {};
        schema.parameters.forEach((param) => {
          if (param.required) {
            initial[param.name] = param.type === "number" ? 0 : param.type === "boolean" ? false : "";
          }
        });
        setInputs(initial);
      }
    }
  }, [nodes, edges]);

  const handleRun = async () => {
    setLoading(true);
    setExecution(null);
    setApprovalReason("");
    setApprovalError(null);
    setActiveTab("run");
    try {
      const cleanInputs = Object.entries(inputs).reduce((acc, [k, v]) => {
        if (v !== "" && v !== undefined && v !== null) acc[k] = v;
        return acc;
      }, {} as Record<string, any>);

      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputData: cleanInputs }),
      });
      const data = await res.json();
      setExecution(data as any);
      if ((data as any).status === "running" || (data as any).status === "pending") {
        setPendingExecutionId((data as any).executionId);
      }
    } catch {
      setExecution({
        executionId: "",
        workflowId,
        status: "failed",
        startedAt: new Date().toISOString(),
        error: "Failed to execute workflow",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (action: "approve" | "reject") => {
    if (!execution?.executionId || !execution.approvalToken) {
      setApprovalError("This approval request is no longer active. Refresh the run and try again.");
      return;
    }
    setApprovalSubmitting(true);
    setApprovalError(null);
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/executions/${execution.executionId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "approve"
              ? {
                  approvalToken: execution.approvalToken,
                  approvalData: {
                    reviewedIn: "workflow-studio",
                    ...(approvalReason.trim()
                      ? { note: approvalReason.trim() }
                      : {}),
                  },
                }
              : {
                  approvalToken: execution.approvalToken,
                  reason: approvalReason.trim() || undefined,
                },
          ),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.message ?? body.error ?? `Could not ${action} workflow`);
      setExecution((current) =>
        current
          ? {
              ...current,
              status: action === "approve" ? "running" : "failed",
              approvalToken: undefined,
              error:
                action === "reject"
                  ? approvalReason.trim() || "Rejected by human reviewer"
                  : undefined,
            }
          : current,
      );
      setApprovalReason("");
      if (action === "reject") setPendingExecutionId(undefined);
    } catch (error) {
      setApprovalError(
        error instanceof Error ? error.message : `Could not ${action} workflow`,
      );
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const renderField = (param: any) => {
    const value = inputs[param.name] ?? "";
    const set = (v: any) => setInputs({ ...inputs, [param.name]: v });
    const typePill = (
      <span
        className="inline-flex items-center text-[10px] px-1.5 py-0 rounded-full border"
        style={{
          backgroundColor: getTypeColor(param.type) + "18",
          borderColor: getTypeColor(param.type) + "50",
          color: getTypeColor(param.type),
        }}
      >
        {formatType(param.type)}
      </span>
    );

    if (param.type === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={param.name}
            checked={value === true || value === "true"}
            onCheckedChange={(c) => set(c)}
          />
          <Label htmlFor={param.name} className="text-xs cursor-pointer">
            {param.name}
            {param.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={param.name} className="text-xs">
            {param.name}
            {param.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          {typePill}
        </div>
        {param.type === "object" || param.type === "array" ? (
          <Textarea
            id={param.name}
            value={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try { set(JSON.parse(e.target.value)); }
              catch { set(e.target.value); }
            }}
            placeholder={`JSON ${param.type}…`}
            className="font-mono text-xs"
            rows={3}
          />
        ) : (
          <Input
            id={param.name}
            type={param.type === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => set(param.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
            placeholder={param.description || `Enter ${param.name}…`}
            className="h-8 text-xs"
          />
        )}
        {param.description && (
          <p className="text-[11px] text-muted-foreground">{param.description}</p>
        )}
      </div>
    );
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
      case "pending": return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "awaiting_approval": return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
      completed: "default",
      failed: "destructive",
      running: "secondary",
      pending: "outline",
      awaiting_approval: "outline",
    };
    return <Badge variant={map[status] ?? "outline"} className="text-[10px]">{status.replace("_", " ")}</Badge>;
  };

  const nodeStatusIcon = (result: any) => {
    if (!result) return null;
    switch (result.status) {
      case "success": return <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />;
      case "error": return <XCircle className="h-3 w-3 text-destructive shrink-0" />;
      case "skipped": return <AlertCircle className="h-3 w-3 text-muted-foreground shrink-0" />;
      default: return null;
    }
  };

  const running = loading || !!pendingExecutionId;

  // Run from the always-visible button: open the console so results are
  // in view, then execute.
  const handleRunClick = () => {
    setOpen(true);
    handleRun();
  };

  return (
    <div
      className={`pointer-events-none absolute inset-y-3 right-3 z-20 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 transition-[width] ${
        open && activeTab === "provenance" ? "w-[760px]" : "w-[380px]"
      }`}
    >
      {/* Command cluster — Run is always one click away */}
      <div className="floating-panel pointer-events-auto flex items-center gap-1 p-1.5">
        <Button
          onClick={handleRunClick}
          disabled={running || !inputSchema}
          className="h-9 gap-2 rounded-xl px-4"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {loading ? "Starting…" : "Running…"}
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run workflow
            </>
          )}
        </Button>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setOpen((current) => !current)}
                aria-label={open ? "Hide workflow activity" : "Open workflow activity"}
              >
                {open ? <PanelRightClose className="h-4 w-4" /> : <SquareTerminal className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {open ? "Hide runs, logs, and integrations" : "Open runs, logs, and integrations"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {open && (
      <div className="floating-panel pointer-events-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border p-1.5">
          <TabsList className="grid h-8 w-full grid-cols-4">
            <TabsTrigger value="run" className="text-xs">Run</TabsTrigger>
            <TabsTrigger value="logs" className="text-xs">Logs</TabsTrigger>
            <TabsTrigger value="provenance" className="text-xs">Provenance</TabsTrigger>
            <TabsTrigger value="integrations" className="text-xs">Integrations</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="run" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 space-y-4">
          {/* Inputs */}
          {inputSchema && inputSchema.parameters.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">Parameters</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  Entry: {inputSchema.startNodeLabel}
                </p>
              </div>
              {inputSchema.parameters.map((p) => (
                <div key={p.name}>{renderField(p)}</div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Add nodes to define workflow inputs
              </p>
            </div>
          )}

          {/* Results */}
          {execution && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Results</p>
                <div className="flex items-center gap-1.5">
                  {statusIcon(execution.status)}
                  {statusBadge(execution.status)}
                </div>
              </div>

              {/* Running — show current node */}
              {(execution.status === "running" || execution.status === "pending") && execution.currentNode && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                  <p className="text-[11px] text-blue-700">
                    Executing node: <code className="font-mono font-medium">{execution.currentNode}</code>
                  </p>
                </div>
              )}

              {/* Awaiting approval */}
              {execution.status === "awaiting_approval" && (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Human review required</p>
                  </div>
                  {execution.pausedAtNode && (
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                      Paused at: <code className="font-mono">{execution.pausedAtNode}</code>
                    </p>
                  )}
                  <Textarea
                    value={approvalReason}
                    onChange={(event) => setApprovalReason(event.target.value)}
                    placeholder="Provenance note or rejection reason (optional; do not include secrets)"
                    rows={2}
                    className="bg-background text-xs"
                    disabled={approvalSubmitting}
                  />
                  {approvalError && (
                    <p role="alert" className="text-[11px] text-destructive">
                      {approvalError}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={approvalSubmitting || !execution.approvalToken}
                      onClick={() => handleApproval("reject")}
                      className="h-8"
                    >
                      {approvalSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      Reject
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={approvalSubmitting || !execution.approvalToken}
                      onClick={() => handleApproval("approve")}
                      className="h-8"
                    >
                      {approvalSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Approve
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Your identity, decision, time, and note are recorded in the provenance trail. Approval credentials are never displayed or exported.
                  </p>
                </div>
              )}

              {/* Error */}
              {(execution.error || execution.errorMessage) && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive mb-1">Error</p>
                  <p className="text-xs text-destructive/80">{execution.error ?? execution.errorMessage}</p>
                </div>
              )}

              {/* Output */}
              {(execution.result ?? execution.outputData) != null && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <p className="mb-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">Output</p>
                  <WorkflowResult raw={execution.result ?? execution.outputData} />
                </div>
              )}

              {/* Step results */}
              {(() => {
                const steps = execution.stepResults ?? execution.nodeResults;
                return steps && Object.keys(steps).length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold mb-1.5">Step Results</p>
                    <Accordion type="multiple" className="w-full">
                      {Object.entries(steps).map(([nodeId, result]) => (
                        <AccordionItem key={nodeId} value={nodeId} className="border-border">
                          <AccordionTrigger className="text-xs font-medium py-2">
                            <div className="flex items-center gap-1.5">
                              {nodeStatusIcon(result)}
                              <span>{nodeId}</span>
                              {(result as any)?.duration != null && (
                                <span className="text-muted-foreground font-normal">
                                  {((result as any).duration / 1000).toFixed(2)}s
                                </span>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            {(result as any)?.error && (
                              <p className="text-[11px] text-destructive px-2 pb-1">{(result as any).error}</p>
                            )}
                            <div className="px-1 pb-1">
                              <WorkflowResult
                                value={(result as any)?.value}
                                raw={(result as any)?.output ?? result}
                                label={nodeId}
                                compact
                              />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ) : null;
              })()}

              <div className="pt-2 border-t border-border space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium">ID:</span>{" "}
                  <code className="font-mono bg-muted px-1 rounded text-[10px]">
                    {execution.executionId || "—"}
                  </code>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium">Started:</span>{" "}
                  {new Date(execution.startedAt).toLocaleTimeString()}
                </p>
                {execution.completedAt && (
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium">Completed:</span>{" "}
                    {new Date(execution.completedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          )}
            </div>
          </ScrollArea>
          <div className="border-t border-border bg-background/95 p-3 backdrop-blur-sm">
            <Button onClick={handleRun} disabled={running || !inputSchema} className="h-9 w-full gap-2 rounded-xl">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {loading ? "Starting…" : pendingExecutionId ? "Running…" : "Run workflow"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="m-0 min-h-0 flex-1">
          <WorkflowRunsPanel
            workflowId={workflowId}
            refreshKey={`${execution?.executionId ?? ""}:${execution?.status ?? ""}`}
          />
        </TabsContent>

        <TabsContent value="provenance" className="m-0 min-h-0 flex-1 overflow-hidden">
          {execution?.executionId ? (
            <TrajectoryView scopeType="workflow" scopeId={execution.executionId} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <ShieldCheck className="h-6 w-6" />
              <span>Run the workflow to see its sources, contributors, decisions, and trajectory.</span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="integrations" className="m-0 min-h-0 flex-1">
          <WorkflowIntegrationsPanel workflowId={workflowId} />
        </TabsContent>
      </Tabs>
      </div>
      )}
    </div>
  );
}
