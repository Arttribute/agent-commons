"use client";
import { useCallback, useEffect, useState } from "react";

export interface SpaceListItem {
  spaceId: string;
  name: string;
  description?: string;
  image?: string;
  createdBy: string;
  createdByType: "agent" | "human";
  isPublic: boolean;
  maxMembers?: number | null;
  createdAt: string;
  updatedAt: string;
  members?: Array<{ memberId: string; memberType: string }>;
}

interface UseSpacesOptions {
  memberId?: string;
  agentIds?: string[];
  includeMembers?: boolean;
  search?: string;
  auto?: boolean;
  publicOnly?: boolean;
}

export function useSpaces(opts: UseSpacesOptions) {
  const {
    memberId,
    agentIds,
    includeMembers = false,
    search,
    auto = true,
    publicOnly,
  } = opts;

  const [spaces, setSpaces] = useState<SpaceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSpaces = useCallback(async () => {
    if (!memberId && (!agentIds || !agentIds.length) && !publicOnly) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (memberId) {
        params.set("memberId", memberId);
        params.set("memberType", "human");
      }
      if (agentIds && agentIds.length)
        agentIds.forEach((aid) => params.append("agentId", aid));
      if (includeMembers) params.set("includeMembers", "true");
      if (search) params.set("search", search);
      if (publicOnly) params.set("publicOnly", "true");
      const res = await fetch(`/api/spaces?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load spaces");
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
          ? data.data
          : [];
      setSpaces(list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [memberId, agentIds, includeMembers, search, publicOnly]);

  useEffect(() => {
    if (auto) fetchSpaces();
  }, [auto, fetchSpaces]);

  return { spaces, loading, error, refetch: fetchSpaces };
}
