"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import ExecutionWidget from "@/components/sessions/chat/execution-widget";
import ChatInputBox from "./chat/chat-input-box";
import InitiatorMessage from "./chat/initiator-message";
import AgentOutput from "./chat/agent-output";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CommonAgent } from "@/types/agent";
import { Card } from "@/components/ui/card";
import { useAgentContext } from "@/context/AgentContext";

interface Message {
  role: string;
  content: string;
  timestamp: string;
  metadata?: {
    toolCalls?: Array<{
      name: string;
      args: any;
      result?: any;
    }>;
    agentCalls?: Array<{
      agentId: string;
      message: string;
      response?: any;
      sessionId?: string;
    }>;
  };
  isStreaming?: boolean;
}

interface SessionInterfaceImprovedProps {
  height?: string;
  agent: CommonAgent | null;
  session: any;
  agentId: string;
  sessionId: string;
  userId?: string;
  onSessionCreated?: (sessionId: string) => void;
  isLoadingSession?: boolean;
  isRedirecting?: boolean;
}

function ExpandableToolCard({ tools }: { tools: Message[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="my-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen(!open);
        }}
        className="flex items-center justify-between p-4 cursor-pointer select-none"
      >
        <div className="text-sm text-muted-foreground font-medium">
          {tools.length} tool call{tools.length > 1 ? "s" : ""}
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {open && (
        <div className="border-t px-4 py-2 space-y-3">
          {tools.map((tool, idx) => (
            <pre
              key={idx}
              className="whitespace-pre-wrap break-words text-xs bg-muted rounded p-3 overflow-x-auto"
            >
              {tool.content}
            </pre>
          ))}
        </div>
      )}
    </Card>
  );
}

function ChatLoadingIndicator() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading conversation...</span>
      </div>
    </div>
  );
}

export default function SessionInterfaceImproved({
  height,
  agent,
  session,
  agentId,
  sessionId,
  userId,
  onSessionCreated,
  isLoadingSession = false,
  isRedirecting = false,
}: SessionInterfaceImprovedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>(session?.tasks || []);
  const [childSessions, setChildSessions] = useState<any[]>(
    session?.childSessions || []
  );
  const [spaces, setSpaces] = useState<any[]>(session?.spaces || []);

  const { messages } = useAgentContext();

  const groupedItems = useMemo(() => {
    type Item =
      | { type: "message"; message: Message }
      | { type: "toolGroup"; tools: Message[] };

    const items: Item[] = [];
    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      if (msg.role === "tool") {
        const tools: Message[] = [];
        while (i < messages.length && messages[i].role === "tool") {
          tools.push(messages[i]);
          i += 1;
        }
        i -= 1;
        items.push({ type: "toolGroup", tools });
      } else {
        items.push({ type: "message", message: msg });
      }
    }
    return items;
  }, [messages]);

  // Get the last message content for tracking streaming updates
  const lastMessageContent = messages[messages.length - 1]?.content;
  const isStreaming = messages[messages.length - 1]?.isStreaming;

  // Smooth scroll to bottom using bottom marker
  const scrollToBottom = useCallback((smooth = true) => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end"
      });
    }
  }, []);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  // Scroll during streaming with throttling
  useEffect(() => {
    if (isStreaming && lastMessageContent) {
      const timeoutId = setTimeout(() => {
        scrollToBottom(true);
      }, 100); // Throttle to every 100ms during streaming
      return () => clearTimeout(timeoutId);
    }
  }, [lastMessageContent, isStreaming, scrollToBottom]);

  useEffect(() => {
    if (sessionId && session) {
      setTasks(session.tasks || []);
      setChildSessions(session.childSessions || []);
      setSpaces(session.spaces || []);
    }
  }, [session, sessionId]);

  return (
    <div className="flex-1 overflow-y-auto py-4">
      <ScrollArea
        className="overflow-y-auto"
        scrollHideDelay={100}
        style={{ height: height ?? "78vh" }}
      >
        <div className="container mx-auto max-w-2xl mb-20" ref={scrollRef}>
          {isLoadingSession && messages.length === 0 ? (
            <ChatLoadingIndicator />
          ) : (
            <>
              {groupedItems.map((item, index) => {
                if (item.type === "message") {
                  const { message } = item;
                  if (message.role === "user" || message.role === "human") {
                    return (
                      <InitiatorMessage
                        key={index}
                        message={message.content}
                        timestamp={message.timestamp}
                      />
                    );
                  }
                  if (message.role === "ai") {
                    const key = message.isStreaming
                      ? `ai-streaming-${index}`
                      : index;
                    return (
                      <AgentOutput
                        key={key}
                        content={message.content}
                        metadata={message.metadata}
                        isStreaming={message.isStreaming}
                      />
                    );
                  }
                  return null;
                }

                return <ExpandableToolCard key={index} tools={item.tools} />;
              })}
              {/* Bottom marker for auto-scroll */}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      </ScrollArea>

      <div className="container mx-auto max-w-2xl">
        <ChatInputBox
          agentId={agentId}
          sessionId={sessionId}
          userId={userId || ""}
          onSessionCreated={onSessionCreated}
          disabled={isRedirecting || isLoadingSession}
        />
      </div>

      <ExecutionWidget
        sessionId={sessionId}
        tasks={tasks}
        childSessions={childSessions}
        spaces={spaces}
      />
    </div>
  );
}
