"use client";

import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { useSessionRunStore } from "@/stores/session-run-store";

export type AgentRunState = "running" | "awaiting_approval" | "awaiting_input" | "completed" | "failed";

export type AgentRun = {
  sessionId: string;
  agentId: string;
  title: string;
  state: AgentRunState;
  activity?: string;
  updatedAt: string;
};

type LocalRuns = {
  runs: Record<string, { agentId?: string; state: AgentRunState; updatedAt: string }>;
  set: (sessionId: string, state: AgentRunState) => void;
};

/** Private Local run states, fed by the desktop runtime's events. */
const useLocalRuns = create<LocalRuns>((set) => ({
  runs: {},
  set: (sessionId, state) => set((current) => ({
    runs: { ...current.runs, [sessionId]: { ...current.runs[sessionId], state, updatedAt: new Date().toISOString() } },
  })),
}));

let localSubscribed = false;
function subscribeLocalRuns() {
  if (localSubscribed || typeof window === "undefined" || !window.agentCommonsLocal) return;
  localSubscribed = true;
  const pendingApprovals = new Map<string, string>();
  window.agentCommonsLocal.onEvent((event) => {
    const runs = useLocalRuns.getState();
    if (event.type === "chat-start") runs.set(event.conversationId, "running");
    if (event.type === "chat-end") runs.set(event.conversationId, "completed");
    if (event.type === "approval" && event.approval.conversationId) {
      pendingApprovals.set(event.approval.id, event.approval.conversationId);
      runs.set(event.approval.conversationId, "awaiting_approval");
    }
    if (event.type === "approval-resolved") {
      const conversationId = pendingApprovals.get(event.id);
      pendingApprovals.delete(event.id);
      if (conversationId && runs.runs[conversationId]?.state === "awaiting_approval") runs.set(conversationId, "running");
    }
  });
}

const POLL_MS = 8_000;
const RECENT_MS = 20 * 60_000;

/**
 * Recent runs per agent: what each agent is working on, waiting for, or just
 * finished. Used for the quiet indicators on agent avatars.
 */
export function useAgentActivity(sessions: Array<{ sessionId: string; agentId: string; title?: string | null }>) {
  const { mode } = useWorkspaceMode();
  const [cloudRuns, setCloudRuns] = useState<AgentRun[]>([]);
  const localRuns = useLocalRuns((state) => state.runs);
  const browserRunning = useSessionRunStore((state) => state.running);
  const browserCompleted = useSessionRunStore((state) => state.completed);

  useEffect(() => {
    if (mode !== "private-local") return;
    subscribeLocalRuns();
  }, [mode]);

  useEffect(() => {
    if (mode !== "cloud") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/agents/runs/active", { cache: "no-store" });
          if (response.ok) {
            const payload = await response.json();
            if (!cancelled) setCloudRuns(Array.isArray(payload?.data) ? payload.data : []);
          }
        } catch {
          // The next poll tries again.
        }
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode]);

  return useMemo(() => {
    const titles = new Map(sessions.map((session) => [session.sessionId, session]));
    const bySession = new Map<string, AgentRun>();
    const add = (run: Omit<AgentRun, "title"> & { title?: string }) => {
      const session = titles.get(run.sessionId);
      const agentId = run.agentId || session?.agentId;
      if (!agentId || Date.now() - Date.parse(run.updatedAt) > RECENT_MS) return;
      const existing = bySession.get(run.sessionId);
      if (existing && existing.updatedAt > run.updatedAt) return;
      bySession.set(run.sessionId, {
        ...run,
        agentId,
        title: (session?.title && session.title !== "New chat" ? session.title : undefined) ?? run.title ?? "New chat",
      });
    };
    if (mode === "private-local") {
      for (const [sessionId, run] of Object.entries(localRuns)) add({ sessionId, agentId: run.agentId ?? "", state: run.state, updatedAt: run.updatedAt });
    } else {
      for (const run of cloudRuns) if (run.sessionId) add(run);
      for (const sessionId of Object.keys(browserRunning)) add({ sessionId, agentId: "", state: "running", updatedAt: new Date().toISOString() });
      for (const [sessionId, completedAt] of Object.entries(browserCompleted)) {
        if (!bySession.has(sessionId)) add({ sessionId, agentId: "", state: "completed", updatedAt: new Date(completedAt).toISOString() });
      }
    }
    const byAgent: Record<string, AgentRun[]> = {};
    const rank = (state: AgentRunState) => (state === "awaiting_approval" || state === "awaiting_input" ? 0 : state === "running" ? 1 : 2);
    for (const run of bySession.values()) (byAgent[run.agentId] ??= []).push(run);
    for (const runs of Object.values(byAgent)) {
      runs.sort((left, right) => rank(left.state) - rank(right.state) || right.updatedAt.localeCompare(left.updatedAt));
      runs.splice(3);
    }
    return byAgent;
  }, [sessions, mode, localRuns, cloudRuns, browserRunning, browserCompleted]);
}
