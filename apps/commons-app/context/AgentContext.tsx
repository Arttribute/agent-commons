"use client";

import { createContext, useContext, useState, useCallback } from "react";

type Message = {
  role: string;
  content: string;
  timestamp: string;
  metadata?: any;
  isStreaming?: boolean;
};

interface AgentContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addMessage: (newMessage: Message) => void;
  updateStreamingMessage: (content: string) => void;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const AgentProvider = ({ children }: { children: React.ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>([]);

  const addMessage = useCallback((newMessage: Message) => {
    setMessages((prevMessages) => [...prevMessages, newMessage]);
  }, []);

  const updateStreamingMessage = useCallback((content: string) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      if (lastMessage && lastMessage.isStreaming) {
        return [
          ...prevMessages.slice(0, -1),
          { ...lastMessage, content: content },
        ];
      } else {
        // This case should ideally not be reached if a temporary streaming message is added initially
        return [
          ...prevMessages,
          {
            role: "ai",
            content: content,
            metadata: {},
            timestamp: new Date().toISOString(),
            isStreaming: true,
          },
        ];
      }
    });
  }, []);

  return (
    <AgentContext.Provider
      value={{ messages, setMessages, addMessage, updateStreamingMessage }}
    >
      {children}
    </AgentContext.Provider>
  );
};

export const useAgentContext = () => {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgentContext must be used within an AgentProvider");
  }
  return context;
};
