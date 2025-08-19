"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Maximize2,
  Minimize2,
  Info,
  Radio,
  X,
} from "lucide-react";
import SpaceInfoDialog from "@/components/sessions/chat/space-info-dialog";
import SpaceMessage from "@/components/sessions/chat/space-message";
import SpaceMessageInput from "@/components/sessions/chat/space-message-input";
import { useAuth } from "@/context/AuthContext";
import SpaceMediaPanel from "@/components/sessions/chat/space-media-panel";

const WS_BASE = process.env.NEXT_PUBLIC_NEST_API_BASE_URL || "";

interface SpaceMessageData {
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
  const [showMediaPanel, setShowMediaPanel] = useState(true);
  const [isMediaExpanded, setIsMediaExpanded] = useState(false);

  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";
  const currentUserId = userAddress;

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  const handleMessageSubmitted = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "human",
        content: content,
        timestamp: new Date().toISOString(),
        senderId: currentUserId,
        senderType: "human",
      },
    ]);
  };

  const handleToggleMediaExpanded = () => {
    setIsMediaExpanded(!isMediaExpanded);
  };

  const fetchSpaceDetails = async () => {
    if (!spaceId) return;

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

        const convertedMessages: Message[] = data.data.messages.map(
          (msg: SpaceMessageData) => ({
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

  useEffect(() => {
    fetchSpaceDetails();
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
              <Button
                variant={showMediaPanel ? "default" : "outline"}
                size="sm"
                onClick={() => setShowMediaPanel(!showMediaPanel)}
              >
                <Radio className="h-4 w-4 mr-1" />
                Media
              </Button>
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
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Full-screen content */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Messages Section */}
            <div
              className={`flex flex-col transition-all duration-300 ${
                showMediaPanel
                  ? isMediaExpanded
                    ? "w-0 opacity-0"
                    : "flex-1"
                  : "w-full"
              }`}
            >
              {!isMediaExpanded && (
                <>
                  {isLoading && (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="animate-spin h-8 w-8 text-gray-500" />
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center justify-center h-32 text-red-500">
                      {error}
                    </div>
                  )}

                  <ScrollArea className="flex-1 bg-gray-50">
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
                </>
              )}

              {/* Message Input - Always visible at bottom */}
              {spaceDetails && (
                <div
                  className={`border-t bg-white transition-all duration-300 ${
                    isMediaExpanded
                      ? "absolute bottom-0 left-0 right-0 z-20"
                      : ""
                  }`}
                >
                  <SpaceMessageInput
                    spaceId={spaceId}
                    members={spaceDetails.members || []}
                    currentUserId={currentUserId}
                    onMessageSubmitted={handleMessageSubmitted}
                  />
                </div>
              )}
            </div>

            {/* Media Panel */}
            {showMediaPanel && (
              <div
                className={`transition-all duration-300 ${isMediaExpanded ? "w-full absolute inset-0 z-10" : "w-80"}`}
              >
                {isMediaExpanded && (
                  <div className="absolute top-3 right-3 z-20">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsMediaExpanded(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <SpaceMediaPanel
                  spaceId={spaceId}
                  selfId={currentUserId}
                  role="human"
                  wsUrl={WS_BASE}
                  isExpanded={isMediaExpanded}
                  onToggleExpanded={handleToggleMediaExpanded}
                />
              </div>
            )}
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
          <ScrollArea className="p-4 h-[380px] bg-gray-50 rounded-b-xl">
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
          {spaceDetails && (
            <div className="rounded-b-xl p-1">
              <SpaceMessageInput
                spaceId={spaceId}
                members={spaceDetails.members || []}
                currentUserId={currentUserId}
                onMessageSubmitted={handleMessageSubmitted}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
