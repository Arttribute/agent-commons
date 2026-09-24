"use client";
import { useState, useEffect, useCallback } from "react";
import type { Agent, CreateAgentParams } from "@agent-commons/sdk";
import type { LocalAgent, LocalState } from "@agent-commons/desktop-contract";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

function fromLocalAgent(agent: LocalAgent, state: LocalState): Agent {
  return {
    agentId: agent.id,
    name: agent.name,
    owner: state.account?.userId ?? "local-workspace",
    instructions: agent.instructions,
    persona: agent.persona,
    avatar: agent.avatar,
    modelProvider: "ollama",
    modelId: agent.model || state.settings.defaultModel,
    createdAt: agent.createdAt,
    isDefault: agent.isDefault,
  };
}

export function useAgents(owner?: string) {
  const { mode } = useWorkspaceMode();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "private-local") {
        const bridge = window.agentCommonsLocal;
        if (!bridge) throw new Error("The local Desktop provider is unavailable.");
        const state = await bridge.getState();
        setAgents(state.agents.map((agent) => fromLocalAgent(agent, state)));
        return;
      }
      const res = await fetch(`/api/agents?owner=${encodeURIComponent(owner)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load agents");
      setAgents(data.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadedOwner(owner);
      setLoading(false);
    }
  }, [owner, mode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (mode !== "private-local") return;
    return window.agentCommonsLocal?.onEvent((event) => {
      if (event.type === "state") setAgents(event.state.agents.map((agent) => fromLocalAgent(agent, event.state)));
    });
  }, [mode]);

  return {
    agents,
    // Effects run after paint, so `loading` alone briefly reported false for a
    // new owner and exposed the empty state. Treat unresolved keys as loading.
    loading: Boolean(owner) && (loading || loadedOwner !== owner),
    error,
    refresh: load,
  };
}

export function useAgent(agentId: string | undefined) {
  const { mode } = useWorkspaceMode();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "private-local") {
        const state = await window.agentCommonsLocal?.getState();
        setAgent(state?.agents.find((item) => item.id === agentId)
          ? fromLocalAgent(state.agents.find((item) => item.id === agentId)!, state) : null);
        return;
      }
      const res = await fetch(`/api/agents/${agentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch agent");
      setAgent(data.data ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [agentId, mode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (mode !== "private-local") return;
    return window.agentCommonsLocal?.onEvent((event) => {
      if (event.type === "state") {
        const item = event.state.agents.find((candidate) => candidate.id === agentId);
        setAgent(item ? fromLocalAgent(item, event.state) : null);
      }
    });
  }, [agentId, mode]);

  return { agent, loading, error, refresh: load };
}

export function useCreateAgent() {
  const { mode } = useWorkspaceMode();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (params: CreateAgentParams): Promise<Agent | null> => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "private-local") {
        const bridge = window.agentCommonsLocal;
        if (!bridge) throw new Error("The local Desktop provider is unavailable.");
        const state = await bridge.saveAgent({
          name: params.name,
          instructions: params.instructions ?? "",
          model: params.modelId ?? "",
          persona: params.persona,
          avatar: params.avatar,
        });
        return fromLocalAgent(state.agents[state.agents.length - 1], state);
      }
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
  }, [mode]);

  return { create, loading, error };
}
