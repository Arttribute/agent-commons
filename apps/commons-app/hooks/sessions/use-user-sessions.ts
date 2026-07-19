"use client";

import { useState, useEffect, useCallback } from "react";

export function useUserSessions(userAddress: string) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedUser, setLoadedUser] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!userAddress) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/sessions/user?initiatorId=${encodeURIComponent(userAddress)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatSessionFetchError(res.status, data));
      }
      setSessions(data.data || []);
    } catch (err) {
      console.error("Error fetching user sessions:", err);
    } finally {
      setLoadedUser(userAddress);
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    setSessions,
    isLoading:
      Boolean(userAddress) && (isLoading || loadedUser !== userAddress),
    refetch: fetchSessions,
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
