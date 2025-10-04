"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
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
  forceFullScreen?: boolean; // when true, always render fullscreen layout and hide maximize/minimize/back toggles
}

export default function SpaceMessaging({
  onBack,
  isEmbedded,
  spaceId,
  spaceName,
  forceFullScreen = false,
}: SpaceMessagingProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spaceDetails, setSpaceDetails] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isFullScreen, setIsFullScreen] = useState(forceFullScreen);
  // Fullscreen layout toggles: media is primary; chat is collapsible
  const [showChatPanel, setShowChatPanel] = useState(true);
  const [isChatExpanded, setIsChatExpanded] = useState(false);

  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";
  const currentUserId = userAddress;

  const toggleFullScreen = () => {
    if (forceFullScreen) return; // disable toggling when forced
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

  const handleToggleChatExpanded = () => {
    setIsChatExpanded(!isChatExpanded);
  };

  const fetchSpaceDetails = async () => {
    if (!spaceId) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/spaces/space?spaceId=${spaceId}&full=true`);
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

  // Realtime message subscription over existing /rtc namespace
  useEffect(() => {
    if (!spaceId) return;
    const wsUrl = WS_BASE;
    const socket: Socket = io(`${wsUrl}/rtc`, {
      transports: ["websocket"],
      autoConnect: true,
    });

    let joined = false;
    socket.on("connect", () => {
      socket.emit("join", {
        type: "join",
        spaceId,
        fromId:
          currentUserId || `viewer-${Math.random().toString(36).slice(2)}`,
        role: "human",
      });
    });

    socket.on("joined", () => {
      joined = true;
    });

    // Deduplicate by messageId across the session
    const seen = new Set<string>();
    // Seed seen with existing messages
    try {
      messages.forEach((m: any) => {
        if ((m as any).messageId) seen.add((m as any).messageId);
      });
    } catch {}

    socket.on("spaceMessage", (evt: any) => {
      if (!evt || evt.spaceId !== spaceId || !evt.message) return;
      const msg = evt.message as any;
      const id = msg.messageId;

      setMessages((prev) => {
        // Convert shape for UI
        const toUi = (mm: any) => ({
          role: mm.senderType === "agent" ? "ai" : "human",
          content: mm.content,
          timestamp: mm.createdAt,
          senderId: mm.senderId,
          senderType: mm.senderType,
          metadata: mm.metadata || undefined,
          messageId: mm.messageId,
          isDeleted: mm.isDeleted,
        });

        const existingIdx = prev.findIndex(
          (p: any) => (p as any).messageId === id
        );
        if (evt.type === "deleted") {
          // Remove or mark deleted
          if (existingIdx >= 0) {
            const copy = prev.slice();
            copy.splice(existingIdx, 1);
            return copy;
          }
          return prev;
        }

        if (evt.type === "updated") {
          if (existingIdx >= 0) {
            const copy = prev.slice();
            copy[existingIdx] = toUi(msg);
            return copy;
          }
          // If we somehow missed create, append
          return [...prev, toUi(msg)];
        }

        // created
        if (existingIdx === -1) {
          return [...prev, toUi(msg)];
        }
        return prev;
      });
    });

    return () => {
      try {
        if (joined) {
          socket.emit("leave", {
            type: "leave",
            spaceId,
            fromId: currentUserId,
          });
        }
        socket.disconnect();
      } catch {}
    };
  }, [spaceId, currentUserId]);

  // Build expected peers list for MediaPanel (ensures agent tiles are always present)
  const expectedPeers = useMemo(() => {
    const list: Array<{ id: string; role: "human" | "agent" }> = [];
    if (spaceDetails?.members) {
      for (const m of spaceDetails.members as any[]) {
        list.push({ id: m.memberId, role: m.memberType });
      }
    }
    // Always include self as human
    if (currentUserId) list.push({ id: currentUserId, role: "human" });
    // Dedup
    const seen = new Set<string>();
    return list.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [spaceDetails?.members, currentUserId]);
  return (
    <>
      {/* Full-screen overlay */}
      {isFullScreen && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col">
          {/* Full-screen header */}
          <div className="p-3 border-b flex items-center gap-3">
            {!forceFullScreen && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
              {spaceName.charAt(0)}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm">{spaceName}</h3>
              <p className="text-xs text-gray-500">{spaceId.slice(0, 12)}...</p>
            </div>
            <div className="flex gap-1">
              <Button
                variant={showChatPanel ? "default" : "outline"}
                size="sm"
                onClick={() => setShowChatPanel(!showChatPanel)}
              >
                <Radio className="h-4 w-4 mr-1" />
                Chat
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
              {!forceFullScreen && (
                <Button variant="ghost" size="sm" onClick={toggleFullScreen}>
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Full-screen content: Media primary, Chat collapsible */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Media Panel (primary) */}
            <div className="flex-1 min-w-0">
              <SpaceMediaPanel
                spaceId={spaceId}
                selfId={currentUserId}
                role="human"
                wsUrl={WS_BASE}
                expectedPeers={expectedPeers}
                isExpanded={true}
              />
            </div>

            {/* Chat Panel (collapsible sidebar) */}
            {showChatPanel && (
              <div
                className={`border-l bg-white transition-all duration-300 ${
                  isChatExpanded ? "w-full absolute inset-0 z-10" : "w-96"
                }`}
              >
                {isChatExpanded && (
                  <div className="absolute top-3 right-3 z-20">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsChatExpanded(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex flex-col h-full">
                  {isLoading && (
                    <div className="flex items-center justify-center h-16">
                      <Loader2 className="animate-spin h-6 w-6 text-gray-500" />
                    </div>
                  )}
                  {error && (
                    <div className="flex items-center justify-center h-16 text-red-500 text-sm">
                      {error}
                    </div>
                  )}
                  <ScrollArea className="flex-1 bg-gray-50">
                    <div className="p-4">
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
                    <div className="border-t bg-white">
                      <SpaceMessageInput
                        spaceId={spaceId}
                        members={spaceDetails.members || []}
                        currentUserId={currentUserId}
                        onMessageSubmitted={handleMessageSubmitted}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regular embedded view */}
      {!isFullScreen && !forceFullScreen && (
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
              {!forceFullScreen && (
                <Button variant="ghost" size="sm" onClick={toggleFullScreen}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
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
