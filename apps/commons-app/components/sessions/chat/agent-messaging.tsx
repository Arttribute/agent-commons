"use client";

import type { Dispatch, SetStateAction } from "react";

import { useRef, useEffect, useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import ExecutionWidget from "@/components/sessions/chat/execution-widget";
import { useChat } from "@/hooks/sessions/use-chat";
import { useGoals } from "@/hooks/sessions/use-goals";
import ChatInputBox from "@/components/sessions/chat/chat-input-box";
import InitiatorMessage from "@/components/sessions/chat/initiator-message";
import AgentOutput from "@/components/sessions/chat/agent-output";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

interface AgentMessagingProps {
  getAgentName: (agentId: string) => string;
  onBack: () => void;
  isEmbedded?: boolean;
  height?: string;
  agent?: CommonAgent | null;
  agentId: string;
  sessionId: string;
}

export default function AgentMessaging({
  onBack,
  isEmbedded,
  agent,
  agentId,
  sessionId,
}: AgentMessagingProps) {
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);

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
  // Fetch session data including goals and tasks
  useEffect(() => {
    if (sessionId) {
      const fetchSessionData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const res = await fetch(
            `/api/sessions/session/full?sessionId=${sessionId}`
          );
          if (!res.ok) {
            throw new Error("Failed to fetch session data");
          }
          const data = await res.json();
          if (data.data?.history) {
            setMessages(data.data.history);
          }
          if (data.data?.goals && data.data.goals.length > 0) {
            setGoals(data.data.goals);
            setSelectedGoal(data.data.goals[0]);
            setSelectedGoalId(data.data.goals[0].goalId);
          }
        } catch (err) {
          console.error("Error fetching session:", err);
          setError("Failed to load session data");
        } finally {
          setIsLoading(false);
        }
      };
      fetchSessionData();
    }
  }, [sessionId, setMessages]);
  return (
    <div className="flex flex-col h-full">
      {/* Header - only show if not embedded */}
      {!isEmbedded && (
        <div className="p-3 border-b flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
            A
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-sm">Agent Name</h3>
            <p className="text-xs text-gray-500">{agentId}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="p-4 h-[460px] bg-gray-50 rounded-b-xl">
        <div className="container mx-auto max-w-2xl">
          {groupedItems.map((item, index) => {
            if (item.type === "message") {
              const { message } = item;
              if (message.role === "user" || message.role === "human") {
                return (
                  <InitiatorMessage
                    key={index}
                    message={message.content}
                    timestamp={message.timestamp}
                    color="blue-100"
                  />
                );
              }
              if (message.role === "ai") {
                return (
                  <div className="bg-white rounded-xl p-2" key={index}>
                    <AgentOutput
                      key={index}
                      content={message.content}
                      metadata={message.metadata}
                    />
                  </div>
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
    </div>
  );
}
