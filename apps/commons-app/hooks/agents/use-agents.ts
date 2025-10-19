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

// Simple in-memory cache and optional localStorage persistence so lists
// survive route navigations and show instantly when the user returns.
type CacheEntry = { ts: number; data: AgentItem[] };
const AGENTS_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export function useAgents(owner?: string, auto: boolean = true) {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromLocalStorage = (o: string) => {
    try {
      if (typeof window === "undefined") return null;
      const raw = localStorage.getItem(`agents:${o}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry;
      if (!parsed || !Array.isArray(parsed.data)) return null;
      if (Date.now() - parsed.ts > CACHE_TTL) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  };

  const fetchAgents = useCallback(
    async (opts?: { background?: boolean }) => {
      const background = !!opts?.background;
      if (!owner) return;
      if (!background) setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (owner) qs.set("owner", owner);
        const res = await fetch(`/api/agents?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load agents");
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
            ? data.data
            : [];
        const mapped: AgentItem[] = list.map((a: any) => ({
          ...a,
          agentId: a.agentId || a.agent_id || a.id,
        }));
        setAgents(mapped);
        try {
          AGENTS_CACHE.set(owner, { ts: Date.now(), data: mapped });
          if (typeof window !== "undefined") {
            localStorage.setItem(
              `agents:${owner}`,
              JSON.stringify({ ts: Date.now(), data: mapped })
            );
          }
        } catch (e) {
          // ignore storage errors
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        if (!background) setLoading(false);
      }
    },
    [owner]
  );

  useEffect(() => {
    if (!owner) return;

    // 1) in-memory cache
    const cached = AGENTS_CACHE.get(owner);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setAgents(cached.data);
      // kick off a background refresh to keep cache fresh
      if (auto) fetchAgents({ background: true });
      return;
    }

    // 2) localStorage cache (survive full page nav)
    const persisted = loadFromLocalStorage(owner);
    if (persisted) {
      setAgents(persisted.data);
      AGENTS_CACHE.set(owner, persisted);
      // background refresh
      if (auto) fetchAgents({ background: true });
      return;
    }

    // 3) nothing cached — fetch now
    if (auto) fetchAgents();
  }, [owner, auto, fetchAgents]);

  return {
    agents,
    loading,
    error,
    refetch: () => fetchAgents({ background: false }),
  };
}
