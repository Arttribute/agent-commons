"use client";
import { useState, useEffect, useCallback } from "react";
import type { Agent, CreateAgentParams } from "@agent-commons/sdk";

export function useAgents(owner?: string) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents?owner=${encodeURIComponent(owner)}`);
      const data = await res.json();
      setAgents(data.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => { load(); }, [load]);

  return { agents, loading, error, refresh: load };
}

export function useAgent(agentId: string | undefined) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch agent");
      setAgent(data.data ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  return { agent, loading, error, refresh: load };
}

export function useCreateAgent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (params: CreateAgentParams): Promise<Agent | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create agent");
      return data.data ?? null;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}
