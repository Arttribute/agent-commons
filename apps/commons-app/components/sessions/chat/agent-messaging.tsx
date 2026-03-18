"use client";

import type { Dispatch, SetStateAction } from "react";

import { useRef, useEffect, useState, useMemo } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import InitiatorMessage from "@/components/sessions/chat/initiator-message";
import AgentOutput from "@/components/sessions/chat/agent-output";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CommonAgent } from "@/types/agent";
import { Card } from "@/components/ui/card";
import { commons } from "@/lib/commons";

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

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

  useEffect(() => {
    if (!sessionId) return;
    const fetchSessionData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await commons.sessions.getFull(sessionId);
        if (data?.history) {
          setMessages(data.history);
        }
      } catch (err) {
        console.error("Error fetching session:", err);
        setError("Failed to load session data");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSessionData();
  }, [sessionId]);

  return (
    <div className="flex flex-col h-full">
      {!isEmbedded && (
        <div className="p-3 border-b flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
            {agent?.name?.[0] ?? "A"}
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-sm">{agent?.name ?? "Agent"}</h3>
            <p className="text-xs text-muted-foreground">{agentId}</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-16">
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-xs text-destructive">{error}</div>
      )}

      <ScrollArea className="p-4 h-[460px] bg-muted/30 rounded-b-xl">
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
                  />
                );
              }
              if (message.role === "ai") {
                return (
                  <div className="bg-background rounded-xl p-2" key={index}>
                    <AgentOutput
                      content={message.content}
                      metadata={message.metadata}
                    />
                  </div>
                );
              }
              return null;
            }
            return null;
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
