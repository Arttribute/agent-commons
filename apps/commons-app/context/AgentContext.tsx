"use client";

import type React from "react";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

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
  finalizeStreamingMessage: (content: string, metadata?: any) => void;
  clearMessages: () => void;
  sessions: any[];
  setSessions: React.Dispatch<React.SetStateAction<any[]>>;
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const AgentProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [inputText, setInputText] = useState<string>("");

  const addMessage = useCallback((newMessage: Message) => {
    setMessages((prevMessages) => [...prevMessages, newMessage]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
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

  const finalizeStreamingMessage = useCallback((content: string, metadata?: any) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      if (lastMessage && lastMessage.isStreaming) {
        return [
          ...prevMessages.slice(0, -1),
          {
            ...lastMessage,
            content: content,
            metadata: metadata || lastMessage.metadata,
            isStreaming: false
          },
        ];
      }
      return prevMessages;
    });
  }, []);

  return (
    <AgentContext.Provider
      value={{
        messages,
        setMessages,
        addMessage,
        updateStreamingMessage,
        finalizeStreamingMessage,
        clearMessages,
        sessions,
        setSessions,
        inputText,
        setInputText,
      }}
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
