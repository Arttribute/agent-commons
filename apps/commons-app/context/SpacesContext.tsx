"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface SpaceMessage {
  id: string;
  agentId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: any;
}

interface SpaceConversation {
  agentId: string;
  agentName?: string;
  messages: SpaceMessage[];
  status: "active" | "completed" | "error";
}

interface CollaborationResult {
  id: string;
  spaceId: string;
  task: string;
  deliverable: string;
  outcome: "success" | "failure";
  duration: number;
  totalMessages: number;
  participants: number;
  agentContributions: {
    agentId: string;
    status: string;
    messageCount: number;
  }[];
  finalResult: string;
  timestamp: string;
}

interface SpacesContextType {
  // Current space state
  currentSpaceId: string | null;
  setCurrentSpaceId: (spaceId: string | null) => void;

  // Conversations between agents in the space
  conversations: SpaceConversation[];
  setConversations: (conversations: SpaceConversation[]) => void;
  addConversation: (conversation: SpaceConversation) => void;
  updateConversation: (agentId: string, messages: SpaceMessage[]) => void;

  // Collaboration results
  collaborationResult: CollaborationResult | null;
  setCollaborationResult: (result: CollaborationResult | null) => void;

  // Loading and error states
  isCollaborating: boolean;
  setIsCollaborating: (isCollaborating: boolean) => void;
  collaborationError: string | null;
  setCollaborationError: (error: string | null) => void;

  // Actions
  clearSpace: () => void;
  createSpace: () => Promise<string>;
  startCollaboration: (
    spaceId: string,
    task: string,
    agentIds: string[]
  ) => Promise<void>;
  startCollaborationStream: (
    spaceId: string,
    task: string,
    agentIds: string[],
    onMessage?: (message: any) => void
  ) => Promise<void>;
}

const SpacesContext = createContext<SpacesContextType | undefined>(undefined);

export const SpacesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<SpaceConversation[]>([]);
  const [collaborationResult, setCollaborationResult] =
    useState<CollaborationResult | null>(null);
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborationError, setCollaborationError] = useState<string | null>(
    null
  );

  const addConversation = (conversation: SpaceConversation) => {
    setConversations((prev) => {
      const existingIndex = prev.findIndex(
        (c) => c.agentId === conversation.agentId
      );
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = conversation;
        return updated;
      }
      return [...prev, conversation];
    });
  };

  const updateConversation = (agentId: string, messages: SpaceMessage[]) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.agentId === agentId ? { ...conv, messages } : conv
      )
    );
  };

  const clearSpace = () => {
    setCurrentSpaceId(null);
    setConversations([]);
    setCollaborationResult(null);
    setIsCollaborating(false);
    setCollaborationError(null);
  };

  const createSpace = async (): Promise<string> => {
    try {
      const response = await fetch("/api/spaces/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Space ${Date.now()}`,
          description: "Collaboration space for agents",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create space");
      }

      const data = await response.json();
      setCurrentSpaceId(data.spaceId);
      return data.spaceId;
    } catch (error) {
      console.error("Error creating space:", error);
      throw error;
    }
  };

  const startCollaboration = async (
    spaceId: string,
    task: string,
    agentIds: string[]
  ) => {
    try {
      setIsCollaborating(true);
      setCollaborationError(null);
      setConversations([]);
      setCollaborationResult(null);

      const response = await fetch(`/api/spaces/${spaceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentIds,
          initialMessage: task,
          enableCollaborationSummary: true,
          timeoutMs: 300000, // 5 minutes timeout
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start collaboration");
      }

      const result = await response.json();
      console.log("Backend collaboration result:", result);

      // Handle the simplified response format
      if (result.summary) {
        setCollaborationResult({
          id: result.spaceId || `collab-${Date.now()}`,
          spaceId: result.spaceId || spaceId,
          task,
          deliverable: result.summary.synthesizedDeliverable || "",
          outcome: result.summary.outcome || "success",
          duration: result.summary.duration || 0,
          totalMessages: result.summary.totalMessages || 0,
          participants: result.summary.participants || agentIds.length,
          agentContributions: result.summary.agentContributions || [],
          finalResult: result.summary.synthesizedDeliverable || "",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error starting collaboration:", error);
      setCollaborationError(
        error instanceof Error ? error.message : "Unknown error"
      );
    } finally {
      setIsCollaborating(false);
    }
  };

  const startCollaborationStream = async (
    spaceId: string,
    task: string,
    agentIds: string[],
    onMessage?: (message: any) => void
  ) => {
    try {
      setIsCollaborating(true);
      setCollaborationError(null);
      setConversations([]);
      setCollaborationResult(null);

      const response = await fetch(`/api/spaces/${spaceId}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          agentIds,
          initialMessage: task,
          enableCollaborationSummary: true,
          timeoutMs: 300000,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "" || !line.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(line.slice(6));

            // Handle different event types from the streamlined backend
            switch (data.type) {
              case "agent_chunk":
                // Skip tokens and forward meaningful chunks
                if (data.chunk?.type !== "token" && onMessage) {
                  onMessage(data);
                }
                break;

              case "agent_completed":
                console.log(`Agent ${data.agentId} completed`);
                if (onMessage) onMessage(data);
                break;

              case "collaboration_summary":
                // Set final results
                setCollaborationResult({
                  id: data.spaceId || `collab-${Date.now()}`,
                  spaceId: data.spaceId || spaceId,
                  task,
                  deliverable: data.summary?.synthesizedDeliverable || "",
                  outcome: data.summary?.outcome || "success",
                  duration: data.summary?.duration || 0,
                  totalMessages: data.summary?.totalMessages || 0,
                  participants: data.summary?.participants || agentIds.length,
                  agentContributions: data.summary?.agentContributions || [],
                  finalResult: data.summary?.synthesizedDeliverable || "",
                  timestamp: new Date().toISOString(),
                });
                if (onMessage) onMessage(data);
                break;

              default:
                // Forward other events
                if (onMessage) onMessage(data);
                break;
            }
          } catch (parseError) {
            console.error("Error parsing SSE data:", parseError);
          }
        }
      }
    } catch (error) {
      console.error("Error starting streaming collaboration:", error);
      setCollaborationError(
        error instanceof Error ? error.message : "Unknown error"
      );
    } finally {
      setIsCollaborating(false);
    }
  };

  const value: SpacesContextType = {
    currentSpaceId,
    setCurrentSpaceId,
    conversations,
    setConversations,
    addConversation,
    updateConversation,
    collaborationResult,
    setCollaborationResult,
    isCollaborating,
    setIsCollaborating,
    collaborationError,
    setCollaborationError,
    clearSpace,
    createSpace,
    startCollaboration,
    startCollaborationStream,
  };

  return (
    <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>
  );
};

export const useSpacesContext = () => {
  const context = useContext(SpacesContext);
  if (context === undefined) {
    throw new Error("useSpacesContext must be used within a SpacesProvider");
  }
  return context;
};
