"use client";

import { create } from "zustand";
import type { ComposerLaunch } from "@/components/sessions/chat/chat-input-box";

type ChatLaunchState = {
  /** First messages waiting to be sent by a freshly opened session view. */
  pending: Record<string, ComposerLaunch>;
  setLaunch: (sessionId: string, launch: ComposerLaunch) => void;
  peekLaunch: (sessionId: string) => ComposerLaunch | null;
  clearLaunch: (sessionId: string) => void;
};

/**
 * Hands a message typed in a launcher (agents overview, project page, agent
 * page) to the session view that sends it, so new chats always open in
 * /sessions/[id] with their attachments and selected knowledge intact.
 */
export const useChatLaunchStore = create<ChatLaunchState>((set, get) => ({
  pending: {},
  setLaunch: (sessionId, launch) => set((state) => ({ pending: { ...state.pending, [sessionId]: launch } })),
  peekLaunch: (sessionId) => get().pending[sessionId] ?? null,
  clearLaunch: (sessionId) => {
    if (!get().pending[sessionId]) return;
    set((state) => {
      const { [sessionId]: _sent, ...pending } = state.pending;
      return { pending };
    });
  },
}));
