"use client";

import { useState } from "react";

type MessageRole = "human" | "ai" | "tool";

interface Message {
  role: MessageRole;
  content: string;
  metadata?: Record<string, any>;
  timestamp?: string;
  steps?: string[];
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      content: "Hello! How can I assist you today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (content: string) => {
    // Add user message to chat
    const userMessage: Message = {
      role: "human",
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // In a real implementation, this would call your API
      // For demo purposes, we'll simulate a response

      // Simulate AI thinking
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Add AI response
      const aiResponse: Message = {
        role: "ai",
        content: "",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiResponse]);

      // Simulate tool calls
      if (
        content.toLowerCase().includes("create") ||
        content.toLowerCase().includes("build")
      ) {
        await simulateToolCalls(content);
      } else {
        // Simple response for other queries
        const finalResponse: Message = {
          role: "ai",
          content: `I understand you want to know about "${content}". How can I help you with that specifically?`,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev.slice(0, -1), finalResponse]);
      }
    } catch (error) {
      console.error("Error sending message:", error);

      // Add error message
      const errorMessage: Message = {
        role: "ai",
        content:
          "Sorry, there was an error processing your request. Please try again.",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const simulateToolCalls = async (content: string) => {
    // Simulate goal creation
    await new Promise((resolve) => setTimeout(resolve, 800));

    const goalToolMessage: Message = {
      role: "tool",
      content: JSON.stringify({
        toolData: {
          goalId: "goal-" + Math.random().toString(36).substring(2, 9),
          title: "Create Project Based on User Request",
          description: `Create a project based on: ${content}`,
          status: "pending",
          progress: 0,
          createdAt: new Date().toISOString(),
        },
      }),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, goalToolMessage]);

    // Simulate task creation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const taskToolMessage: Message = {
      role: "tool",
      content: JSON.stringify({
        toolData: {
          taskId: "task-" + Math.random().toString(36).substring(2, 9),
          title: "Set Up Project Environment",
          description:
            "Initialize a new project with the required dependencies and configuration.",
          status: "pending",
          priority: 1,
          progress: 0,
          context: {
            objective: "Set up the initial project environment.",
            expectedOutputType: "code",
          },
          createdAt: new Date().toISOString(),
        },
      }),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, taskToolMessage]);

    // Simulate AI summary with steps
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const summaryMessage: Message = {
      role: "ai",
      content: `I'll help you ${content}. I've analyzed your request and broken it down into manageable tasks:`,
      timestamp: new Date().toISOString(),
      steps: [
        "Set up the project environment with Next.js, TypeScript, and Tailwind CSS",
        "Install and configure necessary dependencies including Shadcn UI components",
        "Create the basic project structure and layout",
        "Implement the core functionality based on your requirements",
        "Add styling and ensure responsive design",
      ],
    };

    setMessages((prev) => [...prev.slice(0, -3), summaryMessage]);
  };

  return {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
  };
}
