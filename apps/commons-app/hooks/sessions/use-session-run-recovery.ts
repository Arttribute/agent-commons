"use client";

import { useEffect } from "react";
import { useAgentContext } from "@/context/AgentContext";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { isBrowserRunAttached } from "@/hooks/use-agent-stream";
import { notifySessionsChanged } from "@/hooks/sessions/use-user-sessions";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { claimCliToolRequest } from "@/lib/cli-tool-request-claim";
import { normalizeSessionHistory } from "@/lib/session-history";
import { parseEventStream } from "@/lib/sse";
import { useSessionRunStore } from "@/stores/session-run-store";

type RecentRun = {
  runId: string;
  sessionId?: string;
  state: "running" | "awaiting_approval" | "awaiting_input" | "completed" | "failed";
};

type ReplayedEvent = {
  type: string;
  seq?: number;
  prompt?: string;
  content?: string;
  requestId?: string;
  tool?: string;
  toolName?: string;
  args?: unknown;
  message?: string;
  payload?: { content?: string; data?: { content?: string }; metadata?: unknown; title?: string };
};

/** Restore a Cloud run after a full page reload, including its live output. */
export function useSessionRunRecovery(sessionId: string, ready: boolean) {
  const { mode } = useWorkspaceMode();
  const {
    addMessage,
    getSessionMessages,
    updateStreamingMessage,
    finalizeStreamingMessage,
    setSessionHistory,
  } = useAgentContext();
  const markRunning = useSessionRunStore((state) => state.markRunning);
  const markRunId = useSessionRunStore((state) => state.markRunId);
  const markCompleted = useSessionRunStore((state) => state.markCompleted);

  useEffect(() => {
    if (!ready || !sessionId || mode === "private-local") return;
    const abort = new AbortController();
    let cancelled = false;

    const refreshHistory = async () => {
      const response = await desktopApiFetch(`/api/sessions/${sessionId}?full=true`);
      if (!response.ok || cancelled) return;
      const body = await response.json();
      if (!cancelled) setSessionHistory(sessionId, normalizeSessionHistory(body.data?.history));
    };

    const recover = async () => {
      const response = await fetch("/api/agents/runs/active", { cache: "no-store", signal: abort.signal });
      if (!response.ok || cancelled) return;
      const body = await response.json();
      const run = (Array.isArray(body.data) ? body.data : [] as RecentRun[])
        .find((entry: RecentRun) => entry.sessionId === sessionId) as RecentRun | undefined;
      if (!run) return;
      if (run.state === "completed" || run.state === "failed") {
        await refreshHistory();
        return;
      }
      if (isBrowserRunAttached(run.runId)) return;

      let lastSeq = 0;
      let content = "";
      let terminal = false;
      const handledLocalRequests = new Set<string>();
      for (let attempt = 0; attempt < 8 && !cancelled && !terminal; attempt += 1) {
        const streamResponse = await fetch("/api/agents/run/stream/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: run.runId, after: lastSeq }),
          signal: abort.signal,
        });
        if (!streamResponse.ok) break;
        const previousSeq = lastSeq;
        try {
          for await (const event of parseEventStream<ReplayedEvent>(streamResponse)) {
            if (cancelled) return;
            if (typeof event.seq === "number" && event.seq <= lastSeq) continue;
            if (typeof event.seq === "number") lastSeq = event.seq;
            if (event.type === "run_started") {
              const prompt = event.prompt?.trim();
              const current = getSessionMessages(sessionId) ?? [];
              if (prompt && !current.some((message) => message.role === "human" && message.content === prompt)) {
                addMessage({ role: "human", content: prompt, metadata: {}, timestamp: new Date().toISOString() }, sessionId);
              }
              if (!current.at(-1)?.isStreaming) {
                addMessage({ role: "ai", content: "", metadata: {}, timestamp: new Date().toISOString(), isStreaming: true }, sessionId);
              }
              markRunning(sessionId);
              markRunId(sessionId, run.runId);
            } else if (event.type === "token" && event.content) {
              content += event.content;
              const current = getSessionMessages(sessionId)?.at(-1);
              if (!current?.isStreaming || content.length >= current.content.length) {
                updateStreamingMessage(content, sessionId);
              }
            } else if (event.type === "cli_tool_request" && event.requestId && !handledLocalRequests.has(event.requestId)) {
              handledLocalRequests.add(event.requestId);
              const bridge = window.agentCommonsDesktop;
              if (bridge && claimCliToolRequest(event.requestId)) {
                let result: string;
                try {
                  result = await bridge.runTool({
                    tool: event.tool ?? event.toolName ?? "",
                    args: event.args && typeof event.args === "object" && !Array.isArray(event.args)
                      ? event.args as Record<string, unknown>
                      : {},
                    sessionId,
                  });
                } catch (cause) {
                  result = `Error: ${cause instanceof Error ? cause.message : String(cause)}`;
                }
                await fetch("/api/agents/cli-tool-result", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ requestId: event.requestId, result }),
                  signal: abort.signal,
                });
              }
            } else if (event.type === "final" || event.type === "completed") {
              const payload = event.payload;
              finalizeStreamingMessage(payload?.content ?? payload?.data?.content ?? content, payload?.metadata, sessionId);
              markCompleted(sessionId);
              notifySessionsChanged({ sessionId, title: payload?.title });
              terminal = true;
              break;
            } else if (event.type === "error" || event.type === "failed" || event.type === "cancelled") {
              finalizeStreamingMessage(content, { error: event.message ?? "The agent run stopped." }, sessionId);
              markCompleted(sessionId);
              terminal = true;
              break;
            }
          }
        } catch (cause) {
          if (cancelled || abort.signal.aborted) return;
          if (attempt === 7) throw cause;
        }
        if (lastSeq > previousSeq) attempt = 0;
        if (!terminal) await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!cancelled) await refreshHistory();
    };

    void recover().catch((cause) => {
      if (!cancelled && !abort.signal.aborted) console.error("Could not recover the active session run:", cause);
    });
    return () => { cancelled = true; abort.abort(); };
  }, [
    sessionId, ready, mode, addMessage, getSessionMessages, updateStreamingMessage,
    finalizeStreamingMessage, setSessionHistory, markRunning, markRunId, markCompleted,
  ]);
}
