"use client";

import { create } from "zustand";

/** How long the "just finished" blue dot lingers before expiring on its own. */
const COMPLETED_TTL_MS = 15 * 60 * 1000;

interface SessionRunState {
  /** Sessions with an agent run streaming right now (this browser tab). */
  running: Record<string, true>;
  runIds: Record<string, string>;
  /** Recently finished runs the user hasn't looked at yet → completedAt. */
  completed: Record<string, number>;
  markRunning: (sessionId: string) => void;
  markRunId: (sessionId: string, runId: string) => void;
  markCompleted: (sessionId: string) => void;
  /** Viewing a session clears both its spinner state and its unseen dot. */
  markSeen: (sessionId: string) => void;
}

/**
 * Tracks live agent runs per session so the sessions list can show a small
 * spinner on sessions that are still working and a blue "done" dot on runs
 * that finished while the user was looking elsewhere.
 */
export const useSessionRunStore = create<SessionRunState>((set) => ({
  running: {},
  runIds: {},
  completed: {},
  markRunning: (sessionId) => {
    if (!sessionId) return;
    set((state) => {
      const { [sessionId]: _seen, ...completed } = state.completed;
      return { running: { ...state.running, [sessionId]: true }, completed };
    });
  },
  markRunId: (sessionId, runId) => {
    if (!sessionId || !runId) return;
    set((state) => ({ runIds: { ...state.runIds, [sessionId]: runId } }));
  },
  markCompleted: (sessionId) => {
    if (!sessionId) return;
    set((state) => {
      const { [sessionId]: _done, ...running } = state.running;
      const { [sessionId]: _run, ...runIds } = state.runIds;
      return {
        running,
        runIds,
        completed: { ...state.completed, [sessionId]: Date.now() },
      };
    });
  },
  markSeen: (sessionId) => {
    if (!sessionId) return;
    set((state) => {
      if (!state.running[sessionId] && !(sessionId in state.completed)) {
        return state;
      }
      const { [sessionId]: _done, ...completed } = state.completed;
      return { running: state.running, completed };
    });
  },
}));

export function isRecentlyCompleted(completedAt: number | undefined) {
  return Boolean(completedAt && Date.now() - completedAt < COMPLETED_TTL_MS);
}
