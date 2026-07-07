"use client";

import type React from "react";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

type Message = {
  role: string;
  content: string;
  timestamp: string;
  metadata?: any;
  isStreaming?: boolean;
};

export type StreamActivity = {
  id: string;
  stage?: string;
  title: string;
  detail?: string;
  status: "queued" | "running" | "completed" | "failed";
  kind?: "status" | "tool" | "computer" | "file" | "model" | "task";
  toolName?: string;
  timestamp?: string;
  payload?: any;
};

interface AgentContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addMessage: (newMessage: Message) => void;
  updateStreamingMessage: (content: string) => void;
  upsertStreamingActivity: (activity: StreamActivity) => void;
  finalizeStreamingMessage: (content: string, metadata?: any) => void;
  clearMessages: () => void;
  sessions: any[];
  setSessions: React.Dispatch<React.SetStateAction<any[]>>;
  addSession: (session: any) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  streamingTitleSessionId: string | null;
  streamingTitleText: string;
  startTitleStream: (sessionId: string, targetTitle: string) => void;
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  /**
   * One-shot message handed off when a session is launched from the agents
   * overview. The destination agent's new-session view reads it once, sends it,
   * then clears it. Persists across the /studio/agents → /studio/agents/[id]
   * navigation because the AgentProvider wraps both routes.
   */
  pendingPrompt: string | null;
  setPendingPrompt: React.Dispatch<React.SetStateAction<string | null>>;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const AgentProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [streamingTitleSessionId, setStreamingTitleSessionId] = useState<string | null>(null);
  const [streamingTitleText, setStreamingTitleText] = useState<string>("");
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const upsertStreamingActivity = useCallback((activity: StreamActivity) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      const targetMessage =
        lastMessage && lastMessage.isStreaming
          ? lastMessage
          : {
              role: "ai",
              content: "",
              metadata: {},
              timestamp: new Date().toISOString(),
              isStreaming: true,
            };
      const currentActivity = Array.isArray(targetMessage.metadata?.activity)
        ? targetMessage.metadata.activity
        : [];
      const existingIndex = currentActivity.findIndex(
        (item: StreamActivity) => item.id === activity.id
      );
      const nextActivity =
        existingIndex >= 0
          ? currentActivity.map((item: StreamActivity, index: number) =>
              index === existingIndex ? { ...item, ...activity } : item
            )
          : [...currentActivity, activity];
      const nextMessage = {
        ...targetMessage,
        metadata: {
          ...(targetMessage.metadata ?? {}),
          activity: nextActivity,
        },
      };

      if (lastMessage && lastMessage.isStreaming) {
        return [...prevMessages.slice(0, -1), nextMessage];
      }
      return [...prevMessages, nextMessage];
    });
  }, []);

  const finalizeStreamingMessage = useCallback((content: string, metadata?: any) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      if (lastMessage && lastMessage.isStreaming) {
        const mergedMetadata = {
          ...(lastMessage.metadata ?? {}),
          ...(metadata ?? {}),
          activity:
            metadata?.activity ??
            lastMessage.metadata?.activity,
        };
        return [
          ...prevMessages.slice(0, -1),
          {
            ...lastMessage,
            content: content,
            metadata: mergedMetadata,
            isStreaming: false
          },
        ];
      }
      return prevMessages;
    });
  }, []);

  const addSession = useCallback((session: any) => {
    setSessions((prev) => {
      if (prev.some((s) => s.sessionId === session.sessionId)) return prev;
      return [session, ...prev];
    });
  }, []);

  const updateSessionTitle = useCallback((sessionId: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, title } : s))
    );
  }, []);

  const startTitleStream = useCallback((sessionId: string, targetTitle: string) => {
    if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);
    setStreamingTitleSessionId(sessionId);
    setStreamingTitleText("");

    let index = 0;
    titleIntervalRef.current = setInterval(() => {
      index += 1;
      setStreamingTitleText(targetTitle.slice(0, index));
      if (index >= targetTitle.length) {
        clearInterval(titleIntervalRef.current!);
        titleIntervalRef.current = null;
        setStreamingTitleSessionId(null);
        setSessions((prev) =>
          prev.map((s) => (s.sessionId === sessionId ? { ...s, title: targetTitle } : s))
        );
      }
    }, 35);
  }, []);

  return (
    <AgentContext.Provider
      value={{
        messages,
        setMessages,
        addMessage,
        updateStreamingMessage,
        upsertStreamingActivity,
        finalizeStreamingMessage,
        clearMessages,
        sessions,
        setSessions,
        addSession,
        updateSessionTitle,
        streamingTitleSessionId,
        streamingTitleText,
        startTitleStream,
        inputText,
        setInputText,
        pendingPrompt,
        setPendingPrompt,
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
