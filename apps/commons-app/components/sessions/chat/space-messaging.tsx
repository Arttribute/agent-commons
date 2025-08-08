"use client";

import { useEffect, useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Maximize2, Minimize2, Info } from "lucide-react";
import SpaceInfoDialog from "@/components/sessions/chat/space-info-dialog";
import SpaceMessage from "@/components/sessions/chat/space-message";

interface SpaceMessage {
  messageId: string;
  spaceId: string;
  senderId: string;
  senderType: "agent" | "human";
  targetType: "broadcast" | "direct";
  targetIds: string[] | null;
  content: string;
  messageType: "text";
  metadata: {
    agentId?: string;
    sessionId?: string;
    privateKey?: string;
  };
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  role: string;
  content: string;
  timestamp: string;
  senderId?: string;
  senderType?: "agent" | "human";
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

interface SpaceMessagingProps {
  onBack: () => void;
  isEmbedded?: boolean;
  spaceId: string;
  spaceName: string;
}

export default function SpaceMessaging({
  onBack,
  isEmbedded,
  spaceId,
  spaceName,
}: SpaceMessagingProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spaceDetails, setSpaceDetails] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  // Fetch space details including messages
  useEffect(() => {
    if (spaceId) {
      const fetchSpaceDetails = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const res = await fetch(`/api/spaces/full?spaceId=${spaceId}`);
          if (!res.ok) {
            throw new Error("Failed to fetch space details");
          }
          const data = await res.json();

          if (data.data) {
            setSpaceDetails(data.data);

            // Convert space messages to the Message format with sender info
            const convertedMessages: Message[] = data.data.messages.map(
              (msg: SpaceMessage) => ({
                role: msg.senderType === "agent" ? "ai" : "human",
                content: msg.content,
                timestamp: msg.createdAt,
                senderId: msg.senderId,
                senderType: msg.senderType,
                metadata: {
                  agentCalls: msg.metadata.agentId
                    ? [
                        {
                          agentId: msg.metadata.agentId,
                          message: msg.content,
                          sessionId: msg.metadata.sessionId,
                        },
                      ]
                    : [],
                },
              })
            );

            setMessages(convertedMessages);
          }
        } catch (err) {
          console.error("Error fetching space details:", err);
          setError("Failed to load space details");
        } finally {
          setIsLoading(false);
        }
      };
      fetchSpaceDetails();
    }
  }, [spaceId]);

  return (
    <>
      {/* Full-screen overlay */}
      {isFullScreen && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col">
          {/* Full-screen header */}
          <div className="p-3 border-b flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
              {spaceName.charAt(0)}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm">{spaceName}</h3>
              <p className="text-xs text-gray-500">{spaceId.slice(0, 12)}...</p>
            </div>
            <div className="flex gap-1">
              {spaceDetails && (
                <SpaceInfoDialog
                  spaceDetails={spaceDetails}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Info className="h-4 w-4" />
                    </Button>
                  }
                />
              )}
              <Button variant="ghost" size="sm" onClick={toggleFullScreen}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Full-screen content */}
          <div className="flex-1 overflow-hidden">
            {/* Loading indicator when fetching space data */}
            {isLoading && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="animate-spin h-8 w-8 text-gray-500" />
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="flex items-center justify-center h-32 text-red-500">
                {error}
              </div>
            )}

            {/* Messages - Full screen */}
            <ScrollArea className="h-full bg-gray-50">
              <div className="container mx-auto max-w-4xl p-6">
                {messages.map((message, index) => (
                  <SpaceMessage
                    key={index}
                    senderId={message.senderId || "unknown"}
                    senderType={message.senderType || "agent"}
                    content={message.content}
                    timestamp={message.timestamp}
                    metadata={message.metadata}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Regular embedded view */}
      {!isFullScreen && (
        <div className="flex flex-col h-full">
          {/* Header - only show if not embedded */}

          {/* Embedded header with buttons */}
          <div className="p-3 border-b flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
              {spaceName.charAt(0)}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm">{spaceName}</h3>
              <p className="text-xs text-gray-500">{spaceId.slice(0, 12)}...</p>
            </div>
            <div className="flex gap-1">
              {spaceDetails && (
                <SpaceInfoDialog
                  spaceDetails={spaceDetails}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Info className="h-4 w-4" />
                    </Button>
                  }
                />
              )}
              <Button variant="ghost" size="sm" onClick={toggleFullScreen}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Loading indicator when fetching space data */}
          {isLoading && (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="animate-spin h-6 w-6 text-gray-500" />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center justify-center h-16 text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Messages - Embedded view */}
          <ScrollArea className="p-4 h-[460px] bg-gray-50 rounded-b-xl">
            <div className="container mx-auto max-w-2xl">
              {messages.map((message, index) => (
                <SpaceMessage
                  key={index}
                  senderId={message.senderId || "unknown"}
                  senderType={message.senderType || "agent"}
                  content={message.content}
                  timestamp={message.timestamp}
                  metadata={message.metadata}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </>
  );
}
