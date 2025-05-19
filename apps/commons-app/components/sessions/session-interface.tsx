"use client";

import type React from "react";
import type { Dispatch, SetStateAction } from "react";

import { useRef, useEffect, useState } from "react";
import ExecutionWidget from "@/components/sessions/chat/execution-widget";
import { useChat } from "@/hooks/sessions/use-chat";
import { useGoals } from "@/hooks/sessions/use-goals";
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
  onFirstMessage?: (input: string) => void;
  onSessionCreated?: (sessionId: string) => void;
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
  onFirstMessage,
  onSessionCreated,
}: SessionInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
          console.log("Resut data", data);
          if (data.data?.history) {
            setMessages(data.data.history);
          }
          if (data.data?.goals) {
            console.log("Goals:", data.data.goals);
            setGoals(data.data.goals);
            if (data.data?.goals && data.data.goals.length > 0) {
              setSelectedGoal(data.data.goals[0]);
              setSelectedGoalId(data.data.goals[0].goalId);
            }
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
    <div className="flex-1 overflow-y-auto py-4">
      <ScrollArea
        className="overflow-y-auto"
        scrollHideDelay={100}
        style={{ height: height ?? "78vh" }}
      >
        <div className="container mx-auto max-w-2xl">
          {messages.map((message, index) => (
            <div key={index}>
              {message.role === "user" || message.role === "human" ? (
                <InitiatorMessage
                  message={message.content}
                  timestamp={message.timestamp}
                />
              ) : (
                <AgentOutput
                  content={message.content}
                  metadata={message.metadata}
                />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="container mx-auto max-w-2xl">
        <ChatInputBox
          agentId={agentId}
          sessionId={sessionId}
          userId={userId || ""}
          setMessages={setMessages}
          onFirstMessage={onFirstMessage}
          onSessionCreated={onSessionCreated}
        />
      </div>
      <ExecutionWidget
        sessionId={sessionId}
        goals={goals}
        selectedGoal={selectedGoal}
        selectedGoalId={selectedGoalId}
        setSelectedGoalId={setSelectedGoalId}
      />
    </div>
  );
}
