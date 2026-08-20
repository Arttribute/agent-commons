"use client";
import { useState, useEffect, useCallback } from "react";
import type { AgentSkill, Skill, SkillIndex } from "@agent-commons/sdk";

export function useSkills(filter?: {
  ownerId?: string;
  ownerType?: string;
  isPublic?: boolean;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify(filter);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter?.ownerId) params.set("ownerId", filter.ownerId);
      if (filter?.ownerType) params.set("ownerType", filter.ownerType);
      if (filter?.isPublic !== undefined)
        params.set("isPublic", String(filter.isPublic));
      const qs = params.toString();
      const res = await fetch(`/api/skills${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      setSkills(data?.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadedKey(filterKey);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    skills,
    loading: loading || loadedKey !== filterKey,
    error,
    refresh: load,
  };
}

export function useAgentSkills(agentId?: string) {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agentId) {
      setSkills([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/skills/agents/${encodeURIComponent(agentId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "Could not load agent skills",
        );
      }
      setSkills(payload?.data ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load agent skills",
      );
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const setAvailability = useCallback(
    async (skillId: string, isEnabled: boolean) => {
      if (!agentId) return;
      setSkills((current) =>
        current.map((skill) =>
          skill.skillId === skillId ? { ...skill, assigned: isEnabled } : skill,
        ),
      );
      const response = await fetch(
        `/api/skills/${encodeURIComponent(skillId)}/agents/${encodeURIComponent(agentId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isEnabled }),
        },
      );
      if (!response.ok) {
        await load();
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.message ||
            payload?.error ||
            "Could not update skill availability",
        );
      }
    },
    [agentId, load],
  );

  return { skills, loading, error, refresh: load, setAvailability };
}

export function useSkillIndex(ownerId?: string) {
  const [index, setIndex] = useState<SkillIndex[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOwner, setLoadedOwner] = useState<string | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = ownerId ? `?ownerId=${ownerId}` : "";
      const res = await fetch(`/api/skills/index${qs}`);
      const data = await res.json();
      setIndex(data?.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadedOwner(ownerId ?? null);
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    index,
    loading: loading || loadedOwner !== (ownerId ?? null),
    error,
    refresh: load,
  };
}
