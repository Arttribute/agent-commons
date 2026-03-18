"use client";
import { useState, useEffect, useCallback } from "react";
import { commons } from "@/lib/commons";
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
      const res = await commons.skills.list(filter);
      setSkills((res as any)?.data ?? res ?? []);
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
      const res = await commons.skills.getIndex(ownerId);
      setIndex((res as any)?.data ?? res ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  return { index, loading, error, refresh: load };
}
