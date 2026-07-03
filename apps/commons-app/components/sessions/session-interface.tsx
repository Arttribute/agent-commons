"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { ChevronDown, Loader2, Monitor } from "lucide-react";
import ExecutionWidget from "@/components/sessions/chat/execution-widget";
import ChatInputBox from "./chat/chat-input-box";
import InitiatorMessage from "./chat/initiator-message";
import AgentOutput from "./chat/agent-output";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CommonAgent } from "@/types/agent";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  AgentComputerPanel,
  hasActiveComputer,
  type AgentComputer,
} from "@/components/computers/agent-computer-panel";
import { useAgentContext } from "@/context/AgentContext";

interface Message {
  role: string;
  content: string;
  timestamp: string;
  metadata?: {
    attachments?: Array<{
      fileId: string;
      name: string;
      mimeType: string;
      kind?: string;
      sizeBytes?: number;
    }>;
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
    computerRequest?: {
      enabled: boolean;
      computerIds?: string[];
      lifecycle?: "persistent" | "ephemeral";
    };
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
  onSessionCreated?: (sessionId: string, title?: string) => void;
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
  const [computerDrawerOpen, setComputerDrawerOpen] = useState(false);
  const [sessionComputers, setSessionComputers] = useState<AgentComputer[]>([]);

  const { messages, setInputText } = useAgentContext();
  const greeting = (agent as any)?.greeting as string | undefined;
  const conversationStarters = Array.isArray((agent as any)?.conversationStarters)
    ? ((agent as any).conversationStarters as string[]).filter(Boolean)
    : [];

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

  // Refresh tasks from API after streaming ends or on mount
  const fetchTasks = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/tasks?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data?.data || []);
      }
    } catch {
      // silent — tasks will stay stale if request fails
    }
  }, [sessionId]);

  const fetchSessionComputers = useCallback(async () => {
    if (!agentId) return;
    try {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
      const res = await fetch(`/api/agents/${agentId}/computers${query}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setSessionComputers(data?.data ?? []);
      }
    } catch {
      // Computer status is a lightweight hint here; the drawer can refresh itself.
    }
  }, [agentId, sessionId]);

  useEffect(() => {
    fetchSessionComputers();
  }, [fetchSessionComputers, messages.length, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      fetchSessionComputers();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchSessionComputers, isStreaming]);

  // Poll tasks while any task is active (started/in_progress), stop when all terminal
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTaskPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(() => {
      fetchTasks().then(() => {
        setTasks((current) => {
          const hasActive = current.some(
            (t: any) => ["started", "running", "in_progress", "pending"].includes((t as any).status)
          );
          if (!hasActive && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          return current;
        });
      });
    }, 4000);
  }, [fetchTasks]);

  const stopTaskPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // When streaming ends, fetch tasks once then start polling if any are active
  const prevIsStreamingRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    if (wasStreaming && !isStreaming) {
      // Streaming just ended — fetch fresh tasks
      fetchTasks().then(() => {
        setTasks((current) => {
          const hasActive = current.some(
            (t: any) => ["started", "running", "in_progress", "pending"].includes((t as any).status)
          );
          if (hasActive) startTaskPolling();
          return current;
        });
      });
      fetchSessionComputers();
    }
  }, [isStreaming, fetchTasks, fetchSessionComputers, startTaskPolling]);

  // Clean up polling on unmount
  useEffect(() => () => stopTaskPolling(), [stopTaskPolling]);

  return (
    <div className="relative flex-1 overflow-y-auto py-4">
      <Sheet open={computerDrawerOpen} onOpenChange={setComputerDrawerOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute right-4 top-4 z-10 h-9 w-9 rounded-md bg-background/95 shadow-sm backdrop-blur"
            title="Agent computer"
            aria-label="Agent computer"
            onClick={() => fetchSessionComputers()}
          >
            <Monitor className="h-4 w-4" />
            {hasActiveComputer(sessionComputers) && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
            )}
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="flex w-[min(100vw,980px)] max-w-none flex-col gap-0 p-0 sm:max-w-none"
        >
          <AgentComputerPanel
            agentId={agentId}
            sessionId={sessionId || undefined}
            className="h-full"
          />
        </SheetContent>
      </Sheet>
      <ScrollArea
        className="overflow-y-auto"
        scrollHideDelay={100}
        style={{ height: height ?? "78vh" }}
      >
        <div className="container mx-auto max-w-2xl mb-20" ref={scrollRef}>
          {isLoadingSession && messages.length === 0 ? (
            <ChatLoadingIndicator />
          ) : messages.length === 0 && (greeting || conversationStarters.length > 0) ? (
            <div className="flex min-h-[45vh] flex-col justify-center py-8">
              <div className="space-y-4">
                {greeting && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm leading-6 text-foreground">{greeting}</p>
                  </div>
                )}
                {conversationStarters.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {conversationStarters.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        className="rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => setInputText(starter)}
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div ref={bottomRef} />
            </div>
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
                        metadata={message.metadata}
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
