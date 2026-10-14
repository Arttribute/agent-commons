"use client";

import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { useChatLaunchStore, type LaunchAgent } from "@/stores/chat-launch-store";
import type { ComposerLaunch } from "@/components/sessions/chat/chat-input-box";

/**
 * Creates a chat (optionally inside a project) and queues its first message
 * for whichever view opens it. Returns the new session id.
 */
export async function createChat(input: { agentId: string; projectId?: string; launch: ComposerLaunch; agent?: LaunchAgent }) {
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
  useChatLaunchStore.getState().setLaunch(sessionId, input.launch, input.agent);
  return sessionId;
}

export const PENDING_SESSION_PREFIX = "pending-";

export function isPendingSessionId(sessionId: string) {
  return sessionId.startsWith(PENDING_SESSION_PREFIX);
}

/**
 * Opens a chat without waiting for the server: returns a pending session path
 * to navigate to right away. That view shows the message and the agent
 * thinking, then moves to the real session once it exists.
 */
export function beginChat(input: { agent: LaunchAgent; projectId?: string; launch: ComposerLaunch }) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const pendingId = `${PENDING_SESSION_PREFIX}${random}`;
  const store = useChatLaunchStore.getState();
  store.setStart(pendingId, { agent: input.agent, launch: input.launch, projectId: input.projectId });
  createChat({ agentId: input.agent.agentId, projectId: input.projectId, launch: input.launch, agent: input.agent })
    .then((sessionId) => useChatLaunchStore.getState().updateStart(pendingId, { sessionId }))
    .catch((cause) =>
      useChatLaunchStore.getState().updateStart(pendingId, {
        error: cause instanceof Error ? cause.message : "Could not start the chat",
      }),
    );
  return `/sessions/${pendingId}`;
}

/** Creates a chat and returns the session page path to navigate to. */
export async function startChat(input: { agentId: string; projectId?: string; launch: ComposerLaunch }) {
  return `/sessions/${encodeURIComponent(await createChat(input))}`;
}
