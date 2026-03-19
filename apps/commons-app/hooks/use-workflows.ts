"use client";
import { useState, useEffect, useCallback } from "react";
import type { Workflow, WorkflowExecution } from "@agent-commons/sdk";
import { parseEventStream } from "@/lib/sse";

export function useWorkflows(ownerId?: string, ownerType?: 'user' | 'agent') {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ownerId || !ownerType) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows?ownerId=${encodeURIComponent(ownerId)}&ownerType=${ownerType}`);
      const data = await res.json();
      setWorkflows(data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerType]);

  useEffect(() => { load(); }, [load]);

  return { workflows, loading, error, refresh: load };
}

export function useWorkflowExecutionStream(workflowId: string | undefined, executionId: string | undefined) {
  const [execution, setExecution] = useState<Partial<WorkflowExecution>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowId || !executionId) return;
    setDone(false);
    setError(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}/executions/${executionId}/stream`);
        if (!res.ok) throw new Error(`Stream error: ${res.statusText}`);
        for await (const event of parseEventStream<any>(res)) {
          if (cancelled) break;
          if (event.type === 'status') {
            setExecution((prev) => ({
              ...prev,
              status: event.status,
              currentNode: event.currentNode,
              // normalize both naming conventions
              nodeResults: event.nodeResults,
              stepResults: event.nodeResults,
            }));
          } else if (event.type === 'completed') {
            setExecution((prev) => ({
              ...prev,
              status: 'completed',
              outputData: event.outputData,
              result: event.outputData,
              nodeResults: event.nodeResults,
              stepResults: event.nodeResults,
              completedAt: new Date().toISOString(),
            }));
            setDone(true);
          } else if (event.type === 'failed' || event.type === 'cancelled') {
            setExecution((prev) => ({
              ...prev,
              status: event.type,
              errorMessage: event.errorMessage,
              error: event.errorMessage,
            }));
            setDone(true);
          } else if (event.type === 'awaiting_approval') {
            setExecution((prev) => ({
              ...prev,
              status: 'awaiting_approval',
              pausedAtNode: event.pausedAtNode,
              approvalToken: event.approvalToken,
            }));
          } else if (event.type === 'error') {
            setError(event.message ?? 'Unknown error');
            setDone(true);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      }
    })();

    return () => { cancelled = true; };
  }, [workflowId, executionId]);

  return { execution, done, error };
}
