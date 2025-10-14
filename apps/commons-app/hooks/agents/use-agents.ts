"use client";
import { useCallback, useEffect, useState } from "react";

export interface AgentItem {
  agentId: string;
  name: string;
  persona?: string;
  description?: string;
  avatar?: string;
  owner?: string;
  [k: string]: any;
}

export function useAgents(owner?: string, auto: boolean = true) {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (owner) qs.set("owner", owner);
      const res = await fetch(`/api/agents?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load agents");
      const list = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : [];
      setAgents(
        list.map((a: any) => ({
          ...a,
          agentId: a.agentId || a.agent_id || a.id,
        }))
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    if (auto) fetchAgents();
  }, [auto, fetchAgents]);

  return { agents, loading, error, refetch: fetchAgents };
}
