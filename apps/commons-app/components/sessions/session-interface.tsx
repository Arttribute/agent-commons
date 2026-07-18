"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { ChevronDown, Loader2, Monitor } from "lucide-react";
import ExecutionWidget from "@/components/sessions/chat/execution-widget";
import ChatInputBox from "./chat/chat-input-box";
import InitiatorMessage from "./chat/initiator-message";
import AgentOutput from "./chat/agent-output";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CommonAgent } from "@/types/agent";
import { Button } from "@/components/ui/button";
import {
  isActiveComputer,
  type AgentComputer,
  type ComputerRuntimeTab,
} from "@/components/computers/computer-types";
import { AgentComputerSurface } from "@/components/computers/agent-computer-surface";
import { CodeProjectSurface } from "@/components/code-projects/code-project-surface";
import { cn } from "@/lib/utils";
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
  /** A message to auto-send once on mount (handed off from the agents launcher). */
  initialPrompt?: string | null;
  onInitialPromptSent?: () => void;
  /**
   * Optional content (e.g. a back button + title) rendered in a slim bar
   * above the conversation. When present the computer button moves into
   * this bar instead of floating over the messages.
   */
  header?: React.ReactNode;
  /** Copilot side chat deliberately omits the agent-computer surface. */
  allowComputer?: boolean;
  /** Content rendered as part of the conversation, above the composer. */
  conversationAddon?: React.ReactNode;
  uiContext?: Record<string, unknown>;
  externalPrompt?: { id: string; text: string } | null;
}

function ExpandableToolCard({ tools }: { tools: Message[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>
          {tools.length} tool call{tools.length > 1 ? "s" : ""}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-muted-foreground/60 transition-transform group-hover:text-foreground ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {tools.map((tool, idx) => (
            <pre
              key={idx}
              className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs text-muted-foreground"
            >
              {tool.content}
            </pre>
          ))}
        </div>
      )}
    </div>
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
  initialPrompt,
  onInitialPromptSent,
  header,
  allowComputer = true,
  conversationAddon,
  uiContext,
  externalPrompt,
}: SessionInterfaceImprovedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>(session?.tasks || []);
  const [childSessions, setChildSessions] = useState<any[]>(
    session?.childSessions || [],
  );
  const [spaces, setSpaces] = useState<any[]>(session?.spaces || []);
  const [computerOpen, setComputerOpen] = useState(false);
  const [sessionComputer, setSessionComputer] = useState<AgentComputer | null>(
    null,
  );
  const [computerRuntimeTab, setComputerRuntimeTab] =
    useState<ComputerRuntimeTab>("files");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  const { messages, setInputText } = useAgentContext();
  const greeting = (agent as any)?.greeting as string | undefined;
  const conversationStarters = Array.isArray(
    (agent as any)?.conversationStarters,
  )
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
        block: "end",
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

  const fetchAgentComputer = useCallback(async () => {
    if (!agentId || !allowComputer) return;
    try {
      const res = await fetch(`/api/agents/${agentId}/computer`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const computer = data?.data?.computer ?? data?.data ?? null;
        setSessionComputer(computer?.computerId ? computer : null);
      }
    } catch {
      // Computer status is a lightweight hint here; the drawer can refresh itself.
    }
  }, [agentId, allowComputer]);

  useEffect(() => {
    fetchAgentComputer();
  }, [fetchAgentComputer, messages.length, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      fetchAgentComputer();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchAgentComputer, isStreaming]);

  useEffect(() => {
    // Computer activity keeps the drawer state fresh but no longer forces it
    // open — the inline mini computer window in the chat covers the live view.
    const handleComputerActivity = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          tab?: ComputerRuntimeTab;
          computerId?: string;
        }>
      ).detail;
      if (detail?.tab) setComputerRuntimeTab(detail.tab);
      fetchAgentComputer();
    };
    // Clicking the mini computer window opens the full drawer on the right tab.
    const handleComputerOpen = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          tab?: ComputerRuntimeTab;
          computerId?: string;
        }>
      ).detail;
      if (detail?.tab) setComputerRuntimeTab(detail.tab);
      setComputerOpen(true);
      fetchAgentComputer();
    };
    const handleProjectOpen = (event: Event) => {
      const projectId = (event as CustomEvent<{ projectId?: string }>).detail
        ?.projectId;
      if (projectId) {
        setComputerOpen(false);
        setOpenProjectId(projectId);
      }
    };
    window.addEventListener("agent-computer-activity", handleComputerActivity);
    window.addEventListener("agent-computer-open", handleComputerOpen);
    window.addEventListener("code-project-open", handleProjectOpen);
    return () => {
      window.removeEventListener(
        "agent-computer-activity",
        handleComputerActivity,
      );
      window.removeEventListener("agent-computer-open", handleComputerOpen);
      window.removeEventListener("code-project-open", handleProjectOpen);
    };
  }, [fetchAgentComputer]);

  // Poll tasks while any task is active (started/in_progress), stop when all terminal
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTaskPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(() => {
      fetchTasks().then(() => {
        setTasks((current) => {
          const hasActive = current.some((t: any) =>
            ["started", "running", "in_progress", "pending"].includes(
              (t as any).status,
            ),
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
          const hasActive = current.some((t: any) =>
            ["started", "running", "in_progress", "pending"].includes(
              (t as any).status,
            ),
          );
          if (hasActive) startTaskPolling();
          return current;
        });
      });
      fetchAgentComputer();
    }
  }, [isStreaming, fetchTasks, fetchAgentComputer, startTaskPolling]);

  // Clean up polling on unmount
  useEffect(() => () => stopTaskPolling(), [stopTaskPolling]);

  const computerButton =
    allowComputer && !computerOpen ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "relative h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground",
          !header && "absolute right-4 top-4 z-10",
        )}
        title="Agent computer"
        aria-label="Agent computer"
        onClick={() => {
          setComputerOpen(true);
          fetchAgentComputer();
        }}
      >
        <Monitor className="h-4 w-4" />
        {isActiveComputer(sessionComputer) && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
        )}
      </Button>
    ) : null;

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden"
      style={height ? { height } : undefined}
    >
      {/* Chat column: header bar, flexible messages area, pinned input.
          The input is a shrink-0 flex row, so attachment chips and the
          computer chip grow it upward by shrinking the messages area —
          nothing ever pushes the composer out of view. */}
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-col",
          computerOpen ? "flex-1" : "w-full",
        )}
      >
        {header ? (
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">{header}</div>
            {computerButton}
          </div>
        ) : (
          computerButton
        )}
        <ScrollArea className="min-h-0 flex-1" scrollHideDelay={100}>
          <div
            className="container mx-auto max-w-[46rem] px-4 pb-6 pt-4"
            ref={scrollRef}
          >
            {isLoadingSession && messages.length === 0 ? (
              <ChatLoadingIndicator />
            ) : messages.length === 0 &&
              (greeting || conversationStarters.length > 0) ? (
              <div className="flex min-h-[45vh] flex-col justify-center py-8">
                <div className="space-y-4">
                  {greeting && (
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-sm leading-6 text-foreground">
                        {greeting}
                      </p>
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
                  {conversationAddon}
                </div>
                <div ref={bottomRef} />
              </div>
            ) : (
              <>
                {(() => {
                  // The agent identity row appears on the first agent message
                  // after a user turn only — consecutive agent messages flow
                  // together without repeating the avatar.
                  let lastMessageRole: string | null = null;
                  return groupedItems.map((item, index) => {
                    if (item.type === "message") {
                      const { message } = item;
                      if (message.role === "user" || message.role === "human") {
                        lastMessageRole = "human";
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
                        const showAgentHeader = lastMessageRole !== "ai";
                        lastMessageRole = "ai";
                        const key = message.isStreaming
                          ? `ai-streaming-${index}`
                          : index;
                        return (
                          <AgentOutput
                            key={key}
                            content={message.content}
                            metadata={message.metadata}
                            isStreaming={message.isStreaming}
                            computer={sessionComputer}
                            agentName={agent?.name}
                            agentAvatar={(agent as any)?.avatar}
                            showAgentHeader={showAgentHeader}
                          />
                        );
                      }
                      return null;
                    }

                    return (
                      <ExpandableToolCard key={index} tools={item.tools} />
                    );
                  });
                })()}
                {conversationAddon}
                {/* Bottom marker for auto-scroll */}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </ScrollArea>

        <div className="container mx-auto w-full max-w-[46rem] shrink-0 px-4 pb-4">
          <ChatInputBox
            agentId={agentId}
            sessionId={sessionId}
            userId={userId || ""}
            onSessionCreated={onSessionCreated}
            disabled={isRedirecting || isLoadingSession}
            initialPrompt={initialPrompt}
            onInitialPromptSent={onInitialPromptSent}
            allowComputer={allowComputer}
            uiContext={uiContext}
            externalPrompt={externalPrompt}
          />
        </div>

        <ExecutionWidget
          sessionId={sessionId}
          tasks={tasks}
          childSessions={childSessions}
          spaces={spaces}
        />
      </div>

      {allowComputer && computerOpen && (
        <AgentComputerSurface
          agentId={agentId}
          activeTab={computerRuntimeTab}
          autoRefresh={computerOpen || Boolean(isStreaming)}
          onClose={() => setComputerOpen(false)}
        />
      )}
      {allowComputer && openProjectId && (
        <CodeProjectSurface
          agentId={agentId}
          projectId={openProjectId}
          autoRefresh={Boolean(isStreaming)}
          onClose={() => setOpenProjectId(null)}
        />
      )}
    </div>
  );
}
