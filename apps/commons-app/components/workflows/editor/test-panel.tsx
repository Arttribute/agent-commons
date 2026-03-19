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
  FlaskConical,
} from "lucide-react";
import {
  extractWorkflowInputSchema,
  WorkflowInputSchema,
} from "@/lib/workflows/workflow-input-schema";
import { formatType, getTypeColor } from "@/lib/workflows/type-mapping";

interface TestPanelProps {
  workflowId: string;
}

export function TestPanel({ workflowId }: TestPanelProps) {
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [inputSchema, setInputSchema] = useState<WorkflowInputSchema | null>(null);
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [pendingExecutionId, setPendingExecutionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold">Test Run</h3>
          <p className="text-[11px] text-muted-foreground">
            {inputSchema ? `Entry: ${inputSchema.startNodeLabel}` : "Run with sample inputs"}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Inputs */}
          {inputSchema && inputSchema.parameters.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold">Parameters</p>
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

          {/* Run button */}
          <Button
            onClick={handleRun}
            disabled={loading || !!pendingExecutionId || !inputSchema}
            className="w-full gap-2"
            size="sm"
          >
            {loading || pendingExecutionId ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {loading ? "Starting…" : "Running…"}
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run Workflow
              </>
            )}
          </Button>

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
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-1">
                  <p className="text-xs font-medium text-amber-700">Awaiting approval</p>
                  {execution.pausedAtNode && (
                    <p className="text-[11px] text-amber-600">
                      Paused at: <code className="font-mono">{execution.pausedAtNode}</code>
                    </p>
                  )}
                  {execution.approvalToken && (
                    <p className="text-[11px] text-amber-600 break-all">
                      Token: <code className="font-mono">{execution.approvalToken}</code>
                    </p>
                  )}
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
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <p className="text-xs font-medium text-emerald-700 mb-1.5">Output</p>
                  <pre className="text-[11px] text-emerald-800 overflow-auto max-h-40 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(execution.result ?? execution.outputData, null, 2)}
                  </pre>
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
                            <pre className="text-[11px] bg-muted/50 p-2 rounded-md overflow-auto max-h-48 font-mono whitespace-pre-wrap break-all">
                              {JSON.stringify((result as any)?.output ?? result, null, 2)}
                            </pre>
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
    </div>
  );
}
