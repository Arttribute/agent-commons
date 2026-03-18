"use client";

import { useRef, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUp, Loader2 } from "lucide-react";
import { useAgentStream } from "@/hooks/use-agent-stream";
import AgentOutput from "@/components/sessions/chat/agent-output";
import InitiatorMessage from "@/components/sessions/chat/initiator-message";

interface Message {
  role: "user" | "ai";
  content: string;
  isStreaming?: boolean;
}

interface InteractionInterfaceProps {
  agentId: string;
  initiator?: string; // wallet address of the current user
  sessionId?: string;
}

export function InteractionInterface({
  agentId,
  initiator = "",
  sessionId,
}: InteractionInterfaceProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "Hello! How can I help you today?" },
  ]);
  const accumulatedRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const { stream, streaming } = useAgentStream(initiator, {
    onToken: (token) => {
      accumulatedRef.current += token;
      const accumulated = accumulatedRef.current;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          return [...prev.slice(0, -1), { ...last, content: accumulated }];
        }
        return prev;
      });
      scrollToBottom();
    },
    onFinal: (payload) => {
      const content = payload?.content ?? payload?.data?.content ?? accumulatedRef.current;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          return [...prev.slice(0, -1), { role: "ai", content, isStreaming: false }];
        }
        return prev;
      });
      scrollToBottom();
    },
    onError: (message) => {
      setMessages((prev) => [
        ...prev.filter((m) => !m.isStreaming),
        { role: "ai", content: `Error: ${message}` },
      ]);
    },
  });

  const handleSend = async () => {
    if (!input.trim() || streaming) return;

    const userMessage = input.trim();
    setInput("");
    accumulatedRef.current = "";

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
      { role: "ai", content: "", isStreaming: true },
    ]);

    setTimeout(scrollToBottom, 50);

    await stream({
      agentId,
      sessionId,
      messages: [{ role: "user", content: userMessage }],
    });
  };

  return (
    <div className="flex flex-col h-full rounded-xl bg-muted/30 border border-border overflow-hidden">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-2xl mx-auto pb-4">
          {messages.map((msg, idx) => {
            if (msg.role === "user") {
              return (
                <InitiatorMessage
                  key={idx}
                  message={msg.content}
                  timestamp={new Date().toISOString()}
                />
              );
            }
            return (
              <AgentOutput
                key={msg.isStreaming ? `streaming-${idx}` : idx}
                content={msg.content}
                isStreaming={msg.isStreaming}
              />
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border bg-background">
        <div className="flex gap-2 items-end rounded-xl border border-border bg-background shadow-sm px-3 py-2">
          <textarea
            placeholder="Ask me something..."
            className="flex-1 text-sm resize-none focus:outline-none bg-transparent placeholder:text-muted-foreground/60 min-h-[36px] max-h-32"
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={streaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="bg-foreground rounded-lg p-1.5 text-background transition-opacity disabled:opacity-40 hover:opacity-80 shrink-0"
          >
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
