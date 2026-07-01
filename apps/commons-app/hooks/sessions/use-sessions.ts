"use client";

import { useState, useEffect, useCallback } from "react";

export function useSessions(agentId: string, userAddress: string) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!agentId || !userAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/sessions/list?agentId=${agentId}&initiatorId=${userAddress}`
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatSessionFetchError(res.status, data));
      }
      setSessions(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error fetching sessions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, userAddress]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const refetchSessions = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    isLoading,
    error,
    refetchSessions,
  };
}

function formatSessionFetchError(status: number, data: any) {
  const message =
    data?.error?.message ||
    data?.error ||
    data?.message ||
    "Failed to fetch sessions";
  return `Failed to fetch sessions (${status}): ${message}`;
}
