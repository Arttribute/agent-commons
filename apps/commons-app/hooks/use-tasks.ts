"use client";
import { useState, useEffect, useCallback } from "react";
import { commons } from "@/lib/commons";
import type { Task, CreateTaskParams } from "@agent-commons/sdk";

export function useTasks(filter: { sessionId?: string; agentId?: string; ownerId?: string; ownerType?: 'user' | 'agent' }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!filter.sessionId && !filter.agentId && !filter.ownerId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await commons.tasks.list(filter);
      setTasks(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter.sessionId, filter.agentId, filter.ownerId, filter.ownerType]);

  useEffect(() => { load(); }, [load]);

  const createTask = useCallback(async (params: CreateTaskParams): Promise<Task | null> => {
    try {
      const res = await commons.tasks.create(params);
      setTasks((p) => [...p, res.data]);
      return res.data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const cancelTask = useCallback(async (taskId: string) => {
    try {
      await commons.tasks.cancel(taskId);
      setTasks((p) => p.map((t) => t.taskId === taskId ? { ...t, status: 'cancelled' } : t));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  return { tasks, loading, error, refresh: load, createTask, cancelTask };
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
        for await (const event of commons.tasks.stream(taskId)) {
          if (cancelled) break;
          if (event.type === 'status') {
            setStatus((event as any).status ?? '');
            setProgress((event as any).progress ?? 0);
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
