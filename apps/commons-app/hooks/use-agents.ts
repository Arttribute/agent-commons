"use client";
import { useState, useEffect, useCallback } from "react";
import { commons } from "@/lib/commons";
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
      const qs = `?owner=${encodeURIComponent(owner)}`;
      const res = await fetch(`/api/agents${qs}`);
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

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    commons.agents.get(agentId)
      .then((res) => setAgent(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [agentId]);

  return { agent, loading, error };
}

export function useCreateAgent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (params: CreateAgentParams): Promise<Agent | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await commons.agents.create(params);
      return res.data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}
