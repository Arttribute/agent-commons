"use client";

import { useState, useEffect } from "react";
import { WorkflowExecution } from "@/types/workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Play, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface TestPanelProps {
  workflowId: string;
}

export function TestPanel({ workflowId }: TestPanelProps) {
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const handleRunWorkflow = async () => {
    setLoading(true);
    setExecution(null);

    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });

      if (!res.ok) {
        throw new Error("Failed to execute workflow");
      }

      const data = await res.json();
      setExecution(data.data);

      // Poll for results if async
      if (data.data.status === "running" || data.data.status === "pending") {
        pollExecution(data.data.executionId);
      }
    } catch (error) {
      console.error("Failed to run workflow:", error);
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

  const pollExecution = async (executionId: string) => {
    setPolling(true);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/workflows/executions/${executionId}`);

        if (!res.ok) {
          clearInterval(interval);
          setPolling(false);
          return;
        }

        const data = await res.json();
        setExecution(data.data);

        if (data.data.status === "completed" || data.data.status === "failed") {
          clearInterval(interval);
          setPolling(false);
        }
      } catch (error) {
        console.error("Polling error:", error);
        clearInterval(interval);
        setPolling(false);
      }
    }, 1000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      setPolling(false);
    }, 300000);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "running":
      case "pending":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "destructive" | "outline"> = {
      completed: "default",
      failed: "destructive",
      running: "outline",
      pending: "outline",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="w-96 border-l bg-white flex flex-col h-full">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Play className="h-5 w-5" />
          Test Workflow
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Run your workflow with test inputs
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Input form */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Inputs</Label>
            <div className="space-y-2">
              <div>
                <Label htmlFor="testInput" className="text-xs text-gray-600">
                  Input Value
                </Label>
                <Input
                  id="testInput"
                  value={inputs.input || ""}
                  onChange={(e) =>
                    setInputs({ ...inputs, input: e.target.value })
                  }
                  placeholder="Enter test input..."
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Run button */}
          <Button
            onClick={handleRunWorkflow}
            disabled={loading || polling}
            className="w-full"
          >
            {loading || polling ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {loading ? "Starting..." : "Running..."}
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Workflow
              </>
            )}
          </Button>

          {/* Execution results */}
          {execution && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Results</Label>
                <div className="flex items-center gap-2">
                  {getStatusIcon(execution.status)}
                  {getStatusBadge(execution.status)}
                </div>
              </div>

              {/* Error display */}
              {execution.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-medium text-red-800 mb-1">Error</p>
                  <p className="text-xs text-red-700">{execution.error}</p>
                </div>
              )}

              {/* Final result */}
              {execution.result && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-medium text-green-800 mb-1">
                    Final Result
                  </p>
                  <pre className="text-xs text-green-700 overflow-auto max-h-32">
                    {JSON.stringify(execution.result, null, 2)}
                  </pre>
                </div>
              )}

              {/* Step results */}
              {execution.stepResults &&
                Object.keys(execution.stepResults).length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Step Results
                    </Label>
                    <Accordion type="multiple" className="w-full">
                      {Object.entries(execution.stepResults).map(
                        ([nodeId, result]) => (
                          <AccordionItem key={nodeId} value={nodeId}>
                            <AccordionTrigger className="text-xs font-medium">
                              {nodeId}
                            </AccordionTrigger>
                            <AccordionContent>
                              <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-48">
                                {JSON.stringify(result, null, 2)}
                              </pre>
                            </AccordionContent>
                          </AccordionItem>
                        )
                      )}
                    </Accordion>
                  </div>
                )}

              {/* Execution metadata */}
              <div className="pt-3 border-t space-y-1">
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Execution ID:</span>{" "}
                  <code className="text-xs bg-gray-100 px-1 rounded">
                    {execution.executionId}
                  </code>
                </p>
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Started:</span>{" "}
                  {new Date(execution.startedAt).toLocaleString()}
                </p>
                {execution.completedAt && (
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">Completed:</span>{" "}
                    {new Date(execution.completedAt).toLocaleString()}
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
