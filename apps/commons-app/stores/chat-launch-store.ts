"use client";

import { create } from "zustand";
import type { ComposerLaunch } from "@/components/sessions/chat/chat-input-box";

export type LaunchAgent = { agentId: string; name: string; avatar?: string | null };

/** A chat opened before its session exists: shown at /sessions/pending-…. */
export type PendingStart = {
  agent: LaunchAgent;
  launch: ComposerLaunch;
  projectId?: string;
  /** Set once the session is created; the pending view then moves to it. */
  sessionId?: string;
  error?: string;
};

type ChatLaunchState = {
  /** First messages waiting to be sent by a freshly opened session view. */
  pending: Record<string, ComposerLaunch>;
  /** The agent each launched session belongs to, so it can show at once. */
  agents: Record<string, LaunchAgent>;
  starts: Record<string, PendingStart>;
  setLaunch: (sessionId: string, launch: ComposerLaunch, agent?: LaunchAgent) => void;
  peekLaunch: (sessionId: string) => ComposerLaunch | null;
  clearLaunch: (sessionId: string) => void;
  setStart: (pendingId: string, start: PendingStart) => void;
  updateStart: (pendingId: string, patch: Partial<PendingStart>) => void;
  clearStart: (pendingId: string) => void;
};

/**
 * Hands a message typed in a launcher (/new, a project page, an agent's new
 * chat) to the session view that sends it, so new chats open at once with
 * their attachments and selected knowledge intact.
 */
export const useChatLaunchStore = create<ChatLaunchState>((set, get) => ({
  pending: {},
  agents: {},
  starts: {},
  setLaunch: (sessionId, launch, agent) =>
    set((state) => ({
      pending: { ...state.pending, [sessionId]: launch },
      agents: agent ? { ...state.agents, [sessionId]: agent } : state.agents,
    })),
  peekLaunch: (sessionId) => get().pending[sessionId] ?? null,
  clearLaunch: (sessionId) => {
    if (!get().pending[sessionId]) return;
    set((state) => {
      const { [sessionId]: _sent, ...pending } = state.pending;
      return { pending };
    });
  },
  setStart: (pendingId, start) => set((state) => ({ starts: { ...state.starts, [pendingId]: start } })),
  updateStart: (pendingId, patch) =>
    set((state) => {
      const current = state.starts[pendingId];
      return current ? { starts: { ...state.starts, [pendingId]: { ...current, ...patch } } } : state;
    }),
  clearStart: (pendingId) =>
    set((state) => {
      const { [pendingId]: _done, ...starts } = state.starts;
      return { starts };
    }),
}));
