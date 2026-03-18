"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { createCommonsClient } from "@/lib/commons";
import type { StreamEvent, ChatMessage } from "@agent-commons/sdk";

interface UseAgentStreamOptions {
  onToken?: (token: string) => void;
  onToolStart?: (toolName: string, input: string) => void;
  onToolEnd?: (output: any) => void;
  onFinal?: (payload: any) => void;
  onError?: (message: string) => void;
}

export function useAgentStream(initiator: string, options: UseAgentStreamOptions = {}) {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<boolean>(false);
  // Keep options in a ref so the stream callback doesn't go stale when options change
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });

  const stream = useCallback(
    async (params: { agentId: string; messages: ChatMessage[]; sessionId?: string }) => {
      setStreaming(true);
      setError(null);
      abortRef.current = false;

      const client = createCommonsClient(initiator);

      try {
        for await (const event of client.agents.stream(params)) {
          if (abortRef.current) break;
          handleEvent(event, optionsRef.current);
        }
      } catch (err: any) {
        setError(err.message);
        optionsRef.current.onError?.(err.message);
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
    case 'token':
      if (event.content) options.onToken?.(event.content);
      break;
    case 'toolStart':
      options.onToolStart?.(event.toolName ?? '', event.input ?? '');
      break;
    case 'toolEnd':
      options.onToolEnd?.(event.output);
      break;
    case 'final':
      options.onFinal?.(event.payload);
      break;
    case 'error':
      options.onError?.(event.message ?? 'Unknown error');
      break;
  }
}
