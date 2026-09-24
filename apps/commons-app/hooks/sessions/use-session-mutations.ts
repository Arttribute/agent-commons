"use client";

import { useCallback } from "react";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

/**
 * Rename / delete a session via the app API. These are thin wrappers around the
 * `/api/sessions/[sessionId]` route so any session list (dashboard sidebar,
 * agent workspace sidebar, sessions page) can share the same action logic.
 *
 * Callers own their local list state — pass optimistic updates in from the
 * consuming component so the row reacts instantly.
 */
export function useSessionMutations() {
  const { mode } = useWorkspaceMode();
  const renameSession = useCallback(
    async (sessionId: string, title: string): Promise<boolean> => {
      const trimmed = title.trim();
      if (!trimmed) return false;
      try {
        if (mode === "private-local") {
          await window.agentCommonsLocal?.renameConversation(sessionId, trimmed);
          return true;
        }
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
    [mode]
  );

  const deleteSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        if (mode === "private-local") {
          await window.agentCommonsLocal?.deleteConversation(sessionId);
          return true;
        }
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "DELETE",
        });
        return res.ok;
      } catch (err) {
        console.error("Failed to delete session:", err);
        return false;
      }
    },
    [mode]
  );

  return { renameSession, deleteSession };
}
