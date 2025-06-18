"use client";

import type React from "react";
import type { Dispatch, SetStateAction } from "react";

import { useRef, useEffect, useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import ExecutionWidget from "@/components/sessions/chat/execution-widget";
import ChatInputBox from "./chat/chat-input-box";
import InitiatorMessage from "./chat/initiator-message";
import AgentOutput from "./chat/agent-output";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommonAgent } from "@/types/agent";
import { Card } from "@/components/ui/card";

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
}

interface SessionInterfaceProps {
  height?: string;
  agent: CommonAgent | null;
  session: any;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  agentId: string;
  sessionId: string;
  userId?: string;
  onSessionCreated?: (sessionId: string) => void;
}

/**
 * Collapsible card that summarises a group of tool‑call messages. Clicking the
 * header toggles expansion so users can inspect individual tool‑calls.
 */
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

export default function SessionInterface({
  height,
  agent,
  session,
  messages,
  setMessages,
  agentId,
  sessionId,
  userId,
  onSessionCreated,
}: SessionInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<any[]>(session?.goals || []);
  const [childSessions, setChildSessions] = useState<any[]>(
    session?.childSessions || []
  );
  const [selectedGoal, setSelectedGoal] = useState<any>(
    session?.goals?.[0] || null
  );

  // 👇🏼 Build a render‑friendly list where contiguous tool messages are grouped.
  const groupedItems = useMemo(() => {
    /**
     * An item is either a regular chat message or a group of tool‑calls.
     */
    type Item =
      | { type: "message"; message: Message }
      | { type: "toolGroup"; tools: Message[] };

    const items: Item[] = [];
    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      if (msg.role === "tool") {
        const tools: Message[] = [];
        // Collect consecutive tool messages.
        while (i < messages.length && messages[i].role === "tool") {
          tools.push(messages[i]);
          i += 1;
        }
        // Decrement i because the for‑loop will increment again.
        i -= 1;
        items.push({ type: "toolGroup", tools });
      } else {
        items.push({ type: "message", message: msg });
      }
    }
    return items;
  }, [messages]);

  // Auto‑scroll when messages / tool‑cards grow
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [groupedItems]);

  //Get session data when sessionId changes
  useEffect(() => {
    if (sessionId && session) {
      setGoals(session.goals || []);
      setChildSessions(session.childSessions || []);
      setSelectedGoal(session.goals?.[0] || null);
      setSelectedGoalId(session.goals?.[0]?.id || "");
    }
  }, [session, sessionId]);

  return (
    <div className="flex-1 overflow-y-auto py-4">
      <ScrollArea
        className="overflow-y-auto"
        scrollHideDelay={100}
        style={{ height: height ?? "78vh" }}
      >
        <div className="container mx-auto max-w-2xl" ref={scrollRef}>
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
                return (
                  <AgentOutput
                    key={index}
                    content={message.content}
                    metadata={message.metadata}
                  />
                );
              }
              // Fallback – should rarely be reached.
              return null;
            }

            // Render grouped tool‑calls as a single expandable card.
            //return <ExpandableToolCard key={index} tools={item.tools} />;
          })}
        </div>
      </ScrollArea>

      <div className="container mx-auto max-w-2xl">
        <ChatInputBox
          agentId={agentId}
          sessionId={sessionId}
          userId={userId || ""}
          setMessages={setMessages}
          onSessionCreated={onSessionCreated}
        />
      </div>

      <ExecutionWidget
        sessionId={sessionId}
        goals={goals}
        selectedGoal={selectedGoal}
        selectedGoalId={selectedGoalId}
        setSelectedGoalId={setSelectedGoalId}
        childSessions={childSessions}
      />
    </div>
  );
}
