"use client";

import { useRef, useEffect } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { useAgentContext } from "@/context/AgentContext";
import { useAgentStream } from "@/hooks/use-agent-stream";

export default function ChatInputBox({
  agentId,
  sessionId,
  userId,
  disabled,
  onSessionCreated,
}: {
  agentId: string;
  sessionId: string;
  userId: string;
  disabled?: boolean;
  onSessionCreated?: (sessionId: string) => void;
}) {
  const accumulatedRef = useRef("");
  const { addMessage, updateStreamingMessage, finalizeStreamingMessage, inputText, setInputText } =
    useAgentContext();

  const { stream, streaming } = useAgentStream(userId, {
    onToken: (token) => {
      accumulatedRef.current += token;
      updateStreamingMessage(accumulatedRef.current);
    },
    onFinal: (payload) => {
      const content = payload?.content ?? payload?.data?.content ?? "";
      finalizeStreamingMessage(content, payload?.metadata);
      if (payload?.sessionId && payload.sessionId !== sessionId) {
        onSessionCreated?.(payload.sessionId);
      }
    },
    onToolStart: (toolName) => {
      addMessage({
        role: "tool",
        content: JSON.stringify({ type: "toolStart", toolName }, null, 2),
        metadata: {},
        timestamp: new Date().toISOString(),
      });
    },
    onError: (message) => {
      addMessage({
        role: "system",
        content: `Error: ${message}`,
        timestamp: new Date().toISOString(),
      });
    },
  });

  const isLoading = streaming || disabled;

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText;
    setInputText("");
    accumulatedRef.current = "";

    addMessage({
      role: "human",
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // Placeholder for the streaming AI message
    addMessage({
      role: "ai",
      content: "",
      metadata: {},
      timestamp: new Date().toISOString(),
      isStreaming: true,
    });

    await stream({
      agentId,
      sessionId,
      messages: [{ role: "user", content: userMessage }],
    });
  };

  return (
    <div className="rounded-xl bg-background border border-border shadow-sm">
      <textarea
        placeholder="Ask me something..."
        className="text-sm w-full h-16 p-3 rounded-xl resize-none focus:outline-none bg-transparent placeholder:text-muted-foreground/60"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={isLoading}
      />
      <div className="flex justify-end items-center px-2 pb-2">
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || !!isLoading}
          className="bg-foreground rounded-lg p-1.5 text-background transition-opacity disabled:opacity-40 hover:opacity-80"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
