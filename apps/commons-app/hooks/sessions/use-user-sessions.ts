"use client";

import { useState, useEffect, useCallback } from "react";
import type { LocalState } from "@agent-commons/desktop-contract";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

function localSessions(state: LocalState) {
  return state.conversations.map((conversation) => ({
    sessionId: conversation.id,
    agentId: conversation.agentId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  }));
}

const SESSION_LIST_CACHE_MS = 2_000;
const sessionListCache = new Map<
  string,
  { sessions: any[]; expiresAt: number }
>();
const sessionListRequests = new Map<string, Promise<any[]>>();

async function requestUserSessions(userAddress: string, force = false) {
  const key = userAddress.toLowerCase();
  const cached = sessionListCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.sessions;
  }

  const pending = sessionListRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    const res = await fetch(
      `/api/sessions/user?initiatorId=${encodeURIComponent(userAddress)}`,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(formatSessionFetchError(res.status, data));
    }
    const sessions = Array.isArray(data?.data) ? data.data : [];
    sessionListCache.set(key, {
      sessions,
      expiresAt: Date.now() + SESSION_LIST_CACHE_MS,
    });
    return sessions;
  })().finally(() => {
    sessionListRequests.delete(key);
  });

  sessionListRequests.set(key, request);
  return request;
}

export function useUserSessions(userAddress: string) {
  const { mode } = useWorkspaceMode();
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedUser, setLoadedUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(
    async (force = false) => {
      if (!userAddress) return;
      setIsLoading(true);
      setError(null);
      try {
        if (mode === "private-local") {
          const state = await window.agentCommonsLocal?.getState();
          if (!state) throw new Error("The local Desktop provider is unavailable.");
          setSessions(localSessions(state));
          return;
        }
        setSessions(await requestUserSessions(userAddress, force));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        console.error("Error fetching user sessions:", err);
      } finally {
        setLoadedUser(userAddress);
        setIsLoading(false);
      }
    },
    [userAddress, mode],
  );

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);
  useEffect(() => {
    if (mode !== "private-local") return;
    return window.agentCommonsLocal?.onEvent((event) => {
      if (event.type === "state") setSessions(localSessions(event.state));
    });
  }, [mode]);

  const refetch = useCallback(() => fetchSessions(true), [fetchSessions]);

  return {
    sessions,
    setSessions,
    isLoading:
      Boolean(userAddress) && (isLoading || loadedUser !== userAddress),
    error,
    refetch,
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
