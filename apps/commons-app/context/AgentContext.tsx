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
  addMessage: (newMessage: Message, sessionId?: string) => void;
  updateStreamingMessage: (content: string, sessionId?: string) => void;
  upsertStreamingActivity: (activity: StreamActivity, sessionId?: string) => void;
  finalizeStreamingMessage: (content: string, metadata?: any, sessionId?: string) => void;
  activateSession: (sessionId: string) => void;
  setSessionHistory: (sessionId: string, history: Message[]) => void;
  getSessionMessages: (sessionId: string) => Message[] | undefined;
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
  const sessionMessagesRef = useRef<Record<string, Message[]>>({});
  const activeSessionRef = useRef("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [streamingTitleSessionId, setStreamingTitleSessionId] = useState<string | null>(null);
  const [streamingTitleText, setStreamingTitleText] = useState<string>("");
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mutateMessages = useCallback((sessionId: string | undefined, update: (messages: Message[]) => Message[]) => {
    if (sessionId) {
      const next = update(sessionMessagesRef.current[sessionId] ?? []);
      sessionMessagesRef.current[sessionId] = next;
      if (activeSessionRef.current === sessionId) setMessages(next);
    } else {
      setMessages(update);
    }
  }, []);

  const activateSession = useCallback((sessionId: string) => {
    activeSessionRef.current = sessionId;
    setMessages(sessionMessagesRef.current[sessionId] ?? []);
  }, []);

  const setSessionHistory = useCallback((sessionId: string, history: Message[]) => {
    const current = sessionMessagesRef.current[sessionId];
    // A session fetch can begin while a run is active and return an older
    // snapshot after the stream has already completed. Keep the more complete
    // in-memory conversation when navigating away and back during that race.
    if (current?.some((message) => message.isStreaming) || (current?.length ?? 0) > history.length) return;
    sessionMessagesRef.current[sessionId] = history;
    if (activeSessionRef.current === sessionId) setMessages(history);
  }, []);

  const getSessionMessages = useCallback((sessionId: string) => sessionMessagesRef.current[sessionId], []);

  const addMessage = useCallback((newMessage: Message, sessionId?: string) => {
    mutateMessages(sessionId, (prevMessages) => {
      const last = prevMessages.at(-1);
      // A steer appears immediately in the conversation while the current
      // assistant response continues to stream into its existing bubble.
      if (newMessage.role === "human" && last?.role === "ai" && last.isStreaming) {
        return [...prevMessages.slice(0, -1), newMessage, last];
      }
      return [...prevMessages, newMessage];
    });
  }, [mutateMessages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const updateStreamingMessage = useCallback((content: string, sessionId?: string) => {
    mutateMessages(sessionId, (prevMessages) => {
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
  }, [mutateMessages]);

  const upsertStreamingActivity = useCallback((activity: StreamActivity, sessionId?: string) => {
    mutateMessages(sessionId, (prevMessages) => {
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
  }, [mutateMessages]);

  const finalizeStreamingMessage = useCallback((content: string, metadata?: any, sessionId?: string) => {
    mutateMessages(sessionId, (prevMessages) => {
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
  }, [mutateMessages]);

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
        activateSession,
        setSessionHistory,
        getSessionMessages,
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
