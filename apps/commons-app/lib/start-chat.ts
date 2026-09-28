"use client";

import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { useChatLaunchStore } from "@/stores/chat-launch-store";
import type { ComposerLaunch } from "@/components/sessions/chat/chat-input-box";

/**
 * Creates a chat (optionally inside a project) and queues its first message
 * for the session view. Returns the session path to navigate to.
 */
export async function startChat(input: { agentId: string; projectId?: string; launch: ComposerLaunch }) {
  const response = await desktopApiFetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: input.agentId,
      title: "New chat",
      ...(input.projectId ? { projectId: input.projectId } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const sessionId = payload?.data?.sessionId as string | undefined;
  if (!response.ok || !sessionId) {
    throw new Error(payload?.message || payload?.error || "Could not start the chat");
  }
  useChatLaunchStore.getState().setLaunch(sessionId, input.launch);
  return `/sessions/${encodeURIComponent(sessionId)}`;
}
