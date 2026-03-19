"use client";

import { useState, useEffect, useCallback } from "react";

export function useUserSessions(userAddress: string) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!userAddress) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/sessions/user?initiatorId=${encodeURIComponent(userAddress)}`
      );
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      setSessions(data.data || []);
    } catch (err) {
      console.error("Error fetching user sessions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return { sessions, isLoading };
}
