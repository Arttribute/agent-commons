"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import type { StreamEvent, ChatMessage } from "@agent-commons/sdk";
import { parseEventStream } from "@/lib/sse";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { localToolCalls, mapLocalTool } from "@/lib/local-tool-calls";

interface UseAgentStreamOptions {
  onToken?: (token: string) => void;
  onReset?: () => void;
  onStatus?: (event: StreamEvent) => void;
  onTool?: (event: StreamEvent) => void;
  onToolProgress?: (event: StreamEvent) => void;
  onToolStart?: (toolName: string, input: string) => void;
  onToolEnd?: (output: any, event: StreamEvent) => void;
  onCliToolRequest?: (event: StreamEvent) => void;
  onAgentStep?: (event: StreamEvent) => void;
  onFinal?: (payload: any) => void;
  onError?: (message: string) => void;
}

/** Events that mean the run is over and no reconnect should be attempted. */
const TERMINAL_EVENT_TYPES = new Set([
  "final",
  "completed",
  "failed",
  "cancelled",
  "error",
]);

/** Consecutive failed reconnects (no events received) before giving up. */
const MAX_RESUME_ATTEMPTS = 8;

type ResumableStreamEvent = StreamEvent & { seq?: number; runId?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useAgentStream(
  initiator: string,
  options: UseAgentStreamOptions = {},
) {
  const { mode } = useWorkspaceMode();
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<boolean>(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const stream = useCallback(
    async (params: {
      agentId: string;
      messages: ChatMessage[];
      sessionId?: string;
      uiContext?: {
        pathname?: string;
        pageTitle?: string;
        routeName?: string;
        resourceType?: "agent" | "workflow" | "task" | "tool" | "skill";
        resourceId?: string;
        resource?: Record<string, unknown>;
        timeZone?: string;
        locale?: string;
      };
      attachments?: Array<{ fileId: string }>;
      computerRequest?: {
        enabled: boolean;
      };
      /** Knowledge Spaces explicitly referenced for this turn. */
      knowledgeSpaceIds?: string[];
      /** Per-turn thinking depth chosen in the composer; omit for auto. */
      reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max";
      cliContext?: string;
      localWorkspaceRoot?: string;
      provenance?: {
        mode: "off" | "metadata" | "full";
        onchain?: boolean;
      };
    }) => {
      setStreaming(true);
      setError(null);
      abortRef.current = false;

      // The proxy route runs on Vercel, which caps how long a single request
      // can live — far below how long an agent run can take. Every event from
      // the backend carries the runId and a monotonic seq, so when the stream
      // is cut before a terminal event we re-attach through the resume route
      // and continue from the last seq we saw.
      let runId: string | null = null;
      let lastSeq = 0;
      let finished = false;
      const handledLocalRequests = new Set<string>();

      if (mode === "private-local") {
        try {
          const bridge = window.agentCommonsLocal;
          if (!bridge) throw new Error("The local Desktop provider is unavailable.");
          let currentConversationId = params.sessionId ?? "";
          let lastContent = "";
          const unsubscribe = bridge.onEvent((event) => {
            if (abortRef.current) return;
            if (event.type === "chat-start") currentConversationId = event.conversationId;
            if (event.type === "chat-token" && event.conversationId === currentConversationId) {
              if (!event.content) {
                if (lastContent) optionsRef.current.onReset?.();
                lastContent = "";
              } else {
                if (!event.content.startsWith(lastContent)) {
                  optionsRef.current.onReset?.();
                  lastContent = "";
                }
                const delta = event.content.slice(lastContent.length);
                lastContent = event.content;
                if (delta) optionsRef.current.onToken?.(delta);
              }
            }
            if (event.type === "activity" && event.toolName && event.conversationId === currentConversationId) {
              const mapped = mapLocalTool(event.toolName, event.args ?? {}, event.result ?? event.detail ?? "");
              if (event.status === "running") {
                optionsRef.current.onToolStart?.(mapped.name, JSON.stringify(mapped.args));
              } else {
                optionsRef.current.onTool?.({
                  type: "tool",
                  toolName: mapped.name,
                  status: event.status === "error" ? "error" : "completed",
                  output: mapped.result,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          });
          try {
            const content = params.messages.at(-1)?.content;
            const prompt = typeof content === "string" ? content
              : Array.isArray(content) ? content.map((part) =>
                typeof part === "object" && part && "text" in part ? String(part.text) : "").join("\n") : "";
            const result = await bridge.sendMessage({
              agentId: params.agentId,
              conversationId: params.sessionId || undefined,
              prompt,
              spaceIds: params.knowledgeSpaceIds,
              workspaceRoot: params.localWorkspaceRoot,
              interactive: true,
            });
            if (!abortRef.current) optionsRef.current.onFinal?.({
              content: result.response,
              sessionId: result.conversation.id,
              title: result.conversation.title,
              metadata: {
                toolCalls: localToolCalls(result.conversation.messages),
                artifacts: result.conversation.artifacts?.map((artifact) => ({ fileId: artifact.id, name: artifact.name })),
                localConversationId: result.conversation.id,
              },
            });
          } finally {
            unsubscribe();
          }
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          setError(message);
          optionsRef.current.onError?.(message);
        } finally {
          setStreaming(false);
        }
        return;
      }

      const consume = async (res: Response) => {
        for await (const event of parseEventStream<ResumableStreamEvent>(res)) {
          if (abortRef.current) return;
          if (event.runId) runId = event.runId;
          if (typeof event.seq === "number" && event.seq > lastSeq)
            lastSeq = event.seq;
          handleEvent(event, optionsRef.current);
          if (event.type === "cli_tool_request" && event.requestId && !handledLocalRequests.has(event.requestId)) {
            handledLocalRequests.add(event.requestId);
            const bridge = window.agentCommonsDesktop;
            if (bridge) {
              void (async () => {
                let result: string;
                try {
                  result = await bridge.runTool({
                    tool: event.tool ?? event.toolName ?? "",
                    args: event.args ?? {},
                    sessionId: event.sessionId,
                  });
                } catch (cause) {
                  result = `Error: ${cause instanceof Error ? cause.message : String(cause)}`;
                }
                const response = await fetch("/api/agents/cli-tool-result", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ requestId: event.requestId, result }),
                });
                if (!response.ok) optionsRef.current.onError?.("Could not return the local tool result to the agent.");
              })().catch((cause) => optionsRef.current.onError?.(cause instanceof Error ? cause.message : String(cause)));
            }
          }
          if (TERMINAL_EVENT_TYPES.has(event.type)) {
            finished = true;
            return;
          }
        }
      };

      try {
        const res = await fetch("/api/agents/run/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...params, initiator }),
        });

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ message: res.statusText }));
          throw new Error(err.message ?? "Stream request failed");
        }

        try {
          await consume(res);
        } catch (err) {
          if (!runId) throw err; // nothing to resume — surface the failure
        }

        let attempts = 0;
        while (!finished && !abortRef.current && runId) {
          attempts += 1;
          if (attempts > MAX_RESUME_ATTEMPTS) {
            throw new Error(
              "Lost connection to the agent run after multiple reconnect attempts.",
            );
          }
          await sleep(Math.min(500 * attempts, 4000));
          if (abortRef.current) break;

          let resumeRes: Response;
          try {
            resumeRes = await fetch("/api/agents/run/stream/resume", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ runId, after: lastSeq }),
            });
          } catch {
            continue; // transient network failure — retry
          }
          if (resumeRes.status === 404 || resumeRes.status === 410) {
            throw new Error("The agent run is no longer available to resume.");
          }
          if (!resumeRes.ok) continue;

          const seqBefore = lastSeq;
          try {
            await consume(resumeRes);
          } catch {
            // stream dropped again mid-read — loop and re-attach
          }
          if (lastSeq > seqBefore) attempts = 0; // made progress; reset backoff
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        optionsRef.current.onError?.(msg);
      } finally {
        setStreaming(false);
      }
    },
    [initiator, mode],
  );

  const stop = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { stream, stop, streaming, error };
}

function handleEvent(event: StreamEvent, options: UseAgentStreamOptions) {
  switch (event.type) {
    case "token":
      if (event.content) options.onToken?.(event.content);
      break;
    case "status":
      options.onStatus?.(event);
      break;
    case "tool":
      options.onTool?.(event);
      break;
    case "toolProgress":
      options.onToolProgress?.(event);
      break;
    case "toolStart":
      options.onToolStart?.(event.toolName ?? "", event.input ?? "");
      break;
    case "toolEnd":
      options.onToolEnd?.(event.output, event);
      break;
    case "cli_tool_request":
      options.onCliToolRequest?.(event);
      break;
    case "agent_step":
      options.onAgentStep?.(event);
      break;
    case "final":
      options.onFinal?.(event.payload);
      break;
    case "completed":
      options.onFinal?.(event.payload ?? event);
      break;
    case "failed":
    case "cancelled":
      options.onError?.(event.message ?? event.type);
      break;
    case "error":
      options.onError?.(event.message ?? "Unknown error");
      break;
  }
}
