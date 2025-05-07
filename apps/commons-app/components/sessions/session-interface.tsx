"use client";

import type React from "react";

import { useRef, useEffect } from "react";
import ExecutionWidget from "@/components/sessions/chat/execution-widget";
import { useChat } from "@/hooks/sessions/use-chat";
import { useGoals } from "@/hooks/sessions/use-goals";
import { SessionsSideBar } from "./sessions-side-bar";
import ChatInputBox from "./chat/chat-input-box";
import UserMessage from "./chat/user-message";
import { User } from "lucide-react";

export default function SessionInterface() {
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
    <div className="flex  h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <SessionsSideBar username="user" />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="container mx-auto max-w-2xl">
          <UserMessage />
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
    </div>
  );
}
