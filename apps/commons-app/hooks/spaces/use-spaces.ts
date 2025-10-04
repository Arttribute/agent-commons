"use client";

import { useCallback, useEffect, useState } from "react";

export interface SpaceListItem {
  spaceId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdByType: "agent" | "human";
  isPublic: boolean;
  maxMembers?: number | null;
  createdAt: string;
  updatedAt: string;
  members?: Array<{ memberId: string; memberType: string }>;
}

interface UseSpacesOptions {
  memberId?: string; // human wallet
  agentIds?: string[]; // agent ids owned by user
  includeMembers?: boolean;
  search?: string;
  auto?: boolean;
}

export function useSpaces(opts: UseSpacesOptions) {
  const {
    memberId,
    agentIds,
    includeMembers = false,
    search,
    auto = true,
  } = opts;
  const [spaces, setSpaces] = useState<SpaceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!memberId && (!agentIds || !agentIds.length)) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (memberId) {
        params.set("memberId", memberId);
        params.set("memberType", "human");
      }
      if (agentIds && agentIds.length) {
        // Use repeated agentId params for clarity & backend support
        agentIds.forEach((aid) => params.append("agentId", aid));
      }
      if (includeMembers) params.set("includeMembers", "true");
      if (search) params.set("search", search);
      const res = await fetch(`/api/spaces?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load spaces");
      // Expected backend shape: { data, total, limit, offset }
      // Fallback if not present: treat entire object as array or empty
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
  }, [memberId, agentIds, includeMembers, search]);

  useEffect(() => {
    if (auto) refetch();
  }, [refetch, auto]);

  return { spaces, loading, error, refetch };
}
