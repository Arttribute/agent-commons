"use client";
import { useState, useEffect, useCallback } from "react";
import type { Skill, SkillIndex } from "@agent-commons/sdk";

export function useSkills(filter?: { ownerId?: string; ownerType?: string; isPublic?: boolean }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify(filter);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter?.ownerId) params.set("ownerId", filter.ownerId);
      if (filter?.ownerType) params.set("ownerType", filter.ownerType);
      if (filter?.isPublic !== undefined) params.set("isPublic", String(filter.isPublic));
      const qs = params.toString();
      const res = await fetch(`/api/skills${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      setSkills(data?.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { load(); }, [load]);

  return { skills, loading, error, refresh: load };
}

export function useSkillIndex(ownerId?: string) {
  const [index, setIndex] = useState<SkillIndex[]>([]);
  const [loading, setLoading] = useState(false);
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
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  return { index, loading, error, refresh: load };
}
