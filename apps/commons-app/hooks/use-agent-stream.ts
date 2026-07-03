"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import type { StreamEvent, ChatMessage } from "@agent-commons/sdk";
import { parseEventStream } from "@/lib/sse";

interface UseAgentStreamOptions {
  onToken?: (token: string) => void;
  onStatus?: (event: StreamEvent) => void;
  onTool?: (event: StreamEvent) => void;
  onToolStart?: (toolName: string, input: string) => void;
  onToolEnd?: (output: any, event: StreamEvent) => void;
  onCliToolRequest?: (event: StreamEvent) => void;
  onAgentStep?: (event: StreamEvent) => void;
  onFinal?: (payload: any) => void;
  onError?: (message: string) => void;
}

export function useAgentStream(initiator: string, options: UseAgentStreamOptions = {}) {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<boolean>(false);
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });

  const stream = useCallback(
    async (params: {
      agentId: string;
      messages: ChatMessage[];
      sessionId?: string;
      attachments?: Array<{ fileId: string }>;
      computerRequest?: {
        enabled: boolean;
        computerIds?: string[];
        lifecycle?: "persistent" | "ephemeral";
      };
    }) => {
      setStreaming(true);
      setError(null);
      abortRef.current = false;

      try {
        const res = await fetch("/api/agents/run/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...params, initiator }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(err.message ?? "Stream request failed");
        }

        for await (const event of parseEventStream<StreamEvent>(res)) {
          if (abortRef.current) break;
          handleEvent(event, optionsRef.current);
          if (
            event.type === "final" ||
            event.type === "completed" ||
            event.type === "failed" ||
            event.type === "cancelled" ||
            event.type === "error"
          ) break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        optionsRef.current.onError?.(msg);
      } finally {
        setStreaming(false);
      }
    },
    [initiator],
  );

  const stop = useCallback(() => { abortRef.current = true; }, []);

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
