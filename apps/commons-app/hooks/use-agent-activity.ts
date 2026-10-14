"use client";

import { useEffect, useMemo } from "react";
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
  actionUrl?: string;
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
const UNAVAILABLE_BACKOFF_MS = 10 * 60_000;
const RECENT_MS = 20 * 60_000;
/** When the API does not offer run status yet, pause polling instead of retrying every few seconds. */
let unavailableUntil = 0;

/** Cloud run states, polled once for every view that shows them. */
const useCloudRuns = create<{ runs: AgentRun[] }>(() => ({ runs: [] }));
let cloudSubscribers = 0;
let cloudTimer: ReturnType<typeof setTimeout> | undefined;

async function pollCloudRuns() {
  if (document.visibilityState === "visible" && Date.now() >= unavailableUntil) {
    try {
      const response = await fetch("/api/agents/runs/active", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        useCloudRuns.setState({ runs: Array.isArray(payload?.data) ? payload.data : [] });
      } else if (response.status === 404 || response.status === 501 || response.status === 401 || response.status === 403) {
        unavailableUntil = Date.now() + UNAVAILABLE_BACKOFF_MS;
      }
    } catch {
      // The next poll tries again.
    }
  }
  if (cloudSubscribers > 0) cloudTimer = setTimeout(pollCloudRuns, POLL_MS);
}

function subscribeCloudRuns() {
  cloudSubscribers += 1;
  if (cloudSubscribers === 1) void pollCloudRuns();
  return () => {
    cloudSubscribers -= 1;
    if (cloudSubscribers === 0 && cloudTimer) {
      clearTimeout(cloudTimer);
      cloudTimer = undefined;
    }
  };
}

/** Finished runs fade after a while; work in flight or waiting on the person stays longer. */
const ACTIVE_MS = 6 * 60 * 60_000;

export function isWaitingRun(run?: Pick<AgentRun, "state"> | null) {
  return run?.state === "awaiting_approval" || run?.state === "awaiting_input";
}

export function isActiveRun(run?: Pick<AgentRun, "state"> | null) {
  return run?.state === "running" || isWaitingRun(run);
}

/**
 * The latest run state for each session: working, waiting for the person, or
 * just finished. Feeds the run indicators on agents and recent chats.
 */
export function useSessionRuns(sessions: Array<{ sessionId: string; agentId: string; title?: string | null }>) {
  const { mode } = useWorkspaceMode();
  const cloudRuns = useCloudRuns((state) => state.runs);
  const localRuns = useLocalRuns((state) => state.runs);
  const browserRunning = useSessionRunStore((state) => state.running);
  const browserCompleted = useSessionRunStore((state) => state.completed);

  useEffect(() => {
    if (mode !== "private-local") return;
    subscribeLocalRuns();
  }, [mode]);

  useEffect(() => {
    if (mode !== "cloud") return;
    return subscribeCloudRuns();
  }, [mode]);

  return useMemo(() => {
    const titles = new Map(sessions.map((session) => [session.sessionId, session]));
    const bySession = new Map<string, AgentRun>();
    const add = (run: Omit<AgentRun, "title"> & { title?: string }) => {
      const session = titles.get(run.sessionId);
      const agentId = run.agentId || session?.agentId;
      if (!agentId || Date.now() - Date.parse(run.updatedAt) > (isActiveRun(run) ? ACTIVE_MS : RECENT_MS)) return;
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
    return bySession;
  }, [sessions, mode, localRuns, cloudRuns, browserRunning, browserCompleted]);
}

/** Orders runs the way people scan them: waiting on you, then working, then newest. */
export function compareRuns(left: AgentRun, right: AgentRun) {
  const rank = (state: AgentRunState) => (state === "awaiting_approval" || state === "awaiting_input" ? 0 : state === "running" ? 1 : 2);
  return rank(left.state) - rank(right.state) || right.updatedAt.localeCompare(left.updatedAt);
}

/**
 * Recent runs per agent: what each agent is working on, waiting for, or just
 * finished. Used for the quiet indicators on agent avatars.
 */
export function useAgentActivity(sessions: Array<{ sessionId: string; agentId: string; title?: string | null }>) {
  const bySession = useSessionRuns(sessions);
  return useMemo(() => {
    const byAgent: Record<string, AgentRun[]> = {};
    for (const run of bySession.values()) (byAgent[run.agentId] ??= []).push(run);
    for (const runs of Object.values(byAgent)) {
      runs.sort(compareRuns);
      runs.splice(3);
    }
    return byAgent;
  }, [bySession]);
}
