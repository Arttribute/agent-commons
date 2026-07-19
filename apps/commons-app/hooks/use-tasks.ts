"use client";
import { useState, useEffect, useCallback } from "react";
import type { Task, CreateTaskParams } from "@agent-commons/sdk";
import { parseEventStream } from "@/lib/sse";

export function useTasks(filter: { sessionId?: string; agentId?: string; ownerId?: string; ownerType?: 'user' | 'agent' }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!filter.sessionId && !filter.agentId && !filter.ownerId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter.ownerId) params.set("ownerId", filter.ownerId);
      if (filter.ownerType) params.set("ownerType", filter.ownerType);
      if (filter.sessionId) params.set("sessionId", filter.sessionId);
      if (filter.agentId) params.set("agentId", filter.agentId);
      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      setTasks(data.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadedKey(taskFilterKey(filter));
      setLoading(false);
    }
  }, [filter.sessionId, filter.agentId, filter.ownerId, filter.ownerType]);

  useEffect(() => { load(); }, [load]);

  const createTask = useCallback(async (params: CreateTaskParams): Promise<Task | null> => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create task");
      setTasks((p) => [...p, data.data]);
      return data.data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const cancelTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      if (res.ok) setTasks((p) => p.map((t) => t.taskId === taskId ? { ...t, status: 'cancelled' } : t));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const updateTask = useCallback(async (
    taskId: string,
    patch: { title?: string; description?: string; priority?: number },
  ): Promise<Task | null> => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to update task");
      setTasks((p) => p.map((t) => (t.taskId === taskId ? data.data : t)));
      return data.data as Task;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const rescheduleTask = useCallback(async (
    taskId: string,
    patch: { scheduledFor?: Date; estimatedDuration?: number },
  ): Promise<Task | null> => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to reschedule task");
      setTasks((p) => p.map((t) => (t.taskId === taskId ? data.data : t)));
      return data.data as Task;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const key = taskFilterKey(filter);
  return {
    tasks,
    loading: Boolean(key) && (loading || loadedKey !== key),
    error,
    refresh: load,
    createTask,
    cancelTask,
    updateTask,
    rescheduleTask,
  };
}

function taskFilterKey(filter: {
  sessionId?: string;
  agentId?: string;
  ownerId?: string;
  ownerType?: "user" | "agent";
}) {
  if (!filter.sessionId && !filter.agentId && !filter.ownerId) return null;
  return [
    filter.sessionId ?? "",
    filter.agentId ?? "",
    filter.ownerId ?? "",
    filter.ownerType ?? "",
  ].join(":");
}

export function useTaskStream(taskId: string | undefined) {
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    setDone(false);
    setError(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/stream`);
        if (!res.ok) throw new Error(`Stream error: ${res.statusText}`);
        for await (const event of parseEventStream<any>(res)) {
          if (cancelled) break;
          if (event.type === 'status') {
            setStatus(event.status ?? '');
            setProgress(event.progress ?? 0);
          } else if (event.type === 'completed' || event.type === 'failed' || event.type === 'cancelled') {
            setStatus(event.type);
            setDone(true);
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
  }, [taskId]);

  return { status, progress, done, error };
}
