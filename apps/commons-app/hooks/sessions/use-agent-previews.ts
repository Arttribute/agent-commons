"use client";

import { useCallback, useEffect, useState } from "react";
import type { LocalState } from "@agent-commons/desktop-contract";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { SESSIONS_CHANGED } from "@/hooks/sessions/use-user-sessions";
import { messagePreview } from "@/lib/message-preview";

export type AgentPreview = { sessionId: string; text: string };

/** Kept between visits so the list doesn't flash while it refreshes. */
const cache = new Map<string, Record<string, AgentPreview>>();

function fromLocal(state: LocalState): Record<string, AgentPreview> {
  const latest = new Map<string, LocalState["conversations"][number]>();
  for (const conversation of state.conversations) {
    const current = latest.get(conversation.agentId);
    if (!current || conversation.updatedAt > current.updatedAt) latest.set(conversation.agentId, conversation);
  }
  const previews: Record<string, AgentPreview> = {};
  for (const [agentId, conversation] of latest) {
    const message = [...conversation.messages].reverse().find((entry) => entry.role !== "tool" && entry.content?.trim());
    const text = messagePreview(message?.content, message?.role === "user" ? "human" : "ai");
    if (text) previews[agentId] = { sessionId: conversation.id, text };
  }
  return previews;
}

/**
 * The last message of your latest chat with each agent, as one clean line.
 * Refreshes when chats change; `refreshKey` lets the list ask again when its
 * newest chat moves.
 */
export function useAgentPreviews(userAddress: string, refreshKey = "") {
  const { mode } = useWorkspaceMode();
  const key = `${mode}:${userAddress.toLowerCase()}`;
  const [previews, setPreviews] = useState<Record<string, AgentPreview> | null>(() => cache.get(key) ?? null);

  const load = useCallback(async () => {
    if (!userAddress) return;
    try {
      let next: Record<string, AgentPreview>;
      if (mode === "private-local") {
        const state = await window.agentCommonsLocal?.getState();
        if (!state) return;
        next = fromLocal(state);
      } else {
        const response = await fetch("/api/sessions/previews", { cache: "no-store" });
        if (!response.ok) throw new Error("Previews unavailable");
        const payload = await response.json().catch(() => null);
        next = {};
        for (const row of Array.isArray(payload?.data) ? payload.data : []) {
          const text = messagePreview(row?.text, row?.role);
          if (row?.agentId && text) next[row.agentId] = { sessionId: row.sessionId, text };
        }
      }
      cache.set(key, next);
      setPreviews(next);
    } catch {
      // Without previews the list falls back to chat titles.
      setPreviews((current) => current ?? {});
    }
  }, [key, mode, userAddress]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(SESSIONS_CHANGED, onChange);
    const unsubscribe = mode === "private-local"
      ? window.agentCommonsLocal?.onEvent((event) => {
          if (event.type === "state") setPreviews(fromLocal(event.state));
        })
      : undefined;
    return () => {
      window.removeEventListener(SESSIONS_CHANGED, onChange);
      unsubscribe?.();
    };
  }, [load, mode]);

  return previews;
}
