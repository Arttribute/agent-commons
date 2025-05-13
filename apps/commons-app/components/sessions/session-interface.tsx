"use client";

import type React from "react";

import { useRef, useEffect } from "react";
import ExecutionWidget from "@/components/sessions/chat/execution-widget";
import { useChat } from "@/hooks/sessions/use-chat";
import { useGoals } from "@/hooks/sessions/use-goals";
import { SessionsSideBar } from "./sessions-side-bar";
import ChatInputBox from "./chat/chat-input-box";
import InitiatorMessage from "./chat/initiator-message";
import AgentOutput from "./chat/agent-output";
import { Scroll } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SessionInterfaceProps {
  height?: string;
}

export default function SessionInterface({ height }: SessionInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, input, setInput, isLoading, sendMessage } = useChat();
  const { goals, selectedGoal, selectedGoalId, setSelectedGoalId } = useGoals();

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput("");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto py-4">
      <ScrollArea
        className="overflow-y-auto"
        scrollHideDelay={100}
        style={{ height: height ?? "78vh" }}
      >
        <div className="container mx-auto max-w-2xl">
          <InitiatorMessage />

          <AgentOutput />
        </div>
      </ScrollArea>
      <div className="container mx-auto max-w-2xl">
        <ChatInputBox />
      </div>
      {/* Floating Execution Widget */}
      <ExecutionWidget
        goals={goals}
        selectedGoal={selectedGoal}
        selectedGoalId={selectedGoalId}
        setSelectedGoalId={setSelectedGoalId}
      />
    </div>
  );
}
