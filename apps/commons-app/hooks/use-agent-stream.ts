"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import type { StreamEvent, ChatMessage } from "@agent-commons/sdk";
import { parseEventStream } from "@/lib/sse";

interface UseAgentStreamOptions {
  onToken?: (token: string) => void;
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
const TERMINAL_EVENT_TYPES = new Set(["final", "completed", "failed", "cancelled", "error"]);

/** Consecutive failed reconnects (no events received) before giving up. */
const MAX_RESUME_ATTEMPTS = 8;

type ResumableStreamEvent = StreamEvent & { seq?: number; runId?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

      const consume = async (res: Response) => {
        for await (const event of parseEventStream<ResumableStreamEvent>(res)) {
          if (abortRef.current) return;
          if (event.runId) runId = event.runId;
          if (typeof event.seq === "number" && event.seq > lastSeq) lastSeq = event.seq;
          handleEvent(event, optionsRef.current);
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
          const err = await res.json().catch(() => ({ message: res.statusText }));
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
            throw new Error("Lost connection to the agent run after multiple reconnect attempts.");
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
