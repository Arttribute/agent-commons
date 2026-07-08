"use client";

import { useCallback } from "react";

/**
 * Rename / delete a session via the app API. These are thin wrappers around the
 * `/api/sessions/[sessionId]` route so any session list (dashboard sidebar,
 * agent workspace sidebar, sessions page) can share the same action logic.
 *
 * Callers own their local list state — pass optimistic updates in from the
 * consuming component so the row reacts instantly.
 */
export function useSessionMutations() {
  const renameSession = useCallback(
    async (sessionId: string, title: string): Promise<boolean> => {
      const trimmed = title.trim();
      if (!trimmed) return false;
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
        return res.ok;
      } catch (err) {
        console.error("Failed to rename session:", err);
        return false;
      }
    },
    []
  );

  const deleteSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "DELETE",
        });
        return res.ok;
      } catch (err) {
        console.error("Failed to delete session:", err);
        return false;
      }
    },
    []
  );

  return { renameSession, deleteSession };
}
