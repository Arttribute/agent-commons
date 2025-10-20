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
  MessageSquare,
  X,
  LogOut,
} from "lucide-react";
import SpaceInfoDialog from "@/components/spaces/space-info-dialog";
import SpaceMessage from "@/components/spaces/space-message";
import SpaceMessageInput from "@/components/spaces/space-message-input";
import { useAuth } from "@/context/AuthContext";
import SpaceMediaPanel from "@/components/spaces/space-media-panel";

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
  messageId?: string; // server-assigned id
  isDeleted?: boolean;
  pending?: boolean; // optimistic flag until server echo
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
  // Track seen ids to avoid duplicates
  const seenIdsRef = useRef<Set<string>>(new Set());
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
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [
      ...prev,
      {
        role: "human",
        content: content,
        timestamp: new Date().toISOString(),
        senderId: currentUserId,
        senderType: "human",
        messageId: tempId,
        pending: true,
      },
    ]);
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

        // Oldest first for natural chat scroll
        const convertedMessages: Message[] = data.data.messages
          .slice()
          .sort(
            (a: SpaceMessageData, b: SpaceMessageData) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
          .map((msg: SpaceMessageData) => {
            seenIdsRef.current.add(msg.messageId);
            return {
              role: msg.senderType === "agent" ? "ai" : "human",
              content: msg.content,
              timestamp: msg.createdAt,
              senderId: msg.senderId,
              senderType: msg.senderType,
              messageId: msg.messageId,
              isDeleted: msg.isDeleted,
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
            } as Message;
          });

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

  // Realtime message subscription over /space-rtc namespace (same as media)
  useEffect(() => {
    if (!spaceId) return;
    const wsUrl = WS_BASE;
    const socket: Socket = io(`${wsUrl}/space-rtc`, {
      transports: ["websocket"],
      autoConnect: true,
    });

    let joined = false;
    socket.on("connect", () => {
      const participantId =
        currentUserId || `viewer-${Math.random().toString(36).slice(2)}`;
      console.debug("[space-messaging] socket connected, joining space", {
        spaceId,
        participantId,
      });
      socket.emit(
        "join_space",
        {
          spaceId,
          participantId,
          participantType: "human",
        },
        (ack: any) => {
          if (ack?.success) {
            joined = true;
            console.debug("[space-messaging] joined space room", spaceId);
          } else {
            console.warn("[space-messaging] failed to join space", ack);
          }
        }
      );
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
      if (!id) return;
      console.debug("[space-messaging] received spaceMessage", evt.type, id);

      setMessages((prev) => {
        const toUi = (mm: any): Message => ({
          role: mm.senderType === "agent" ? "ai" : "human",
          content: mm.content,
          timestamp: mm.createdAt,
          senderId: mm.senderId,
          senderType: mm.senderType,
          messageId: mm.messageId,
          isDeleted: mm.isDeleted,
          metadata: mm.metadata || undefined,
        });

        const existingIdx = prev.findIndex((p) => p.messageId === id);
        // Also locate any pending optimistic entry that matches content & sender without messageId
        const pendingIdx =
          existingIdx === -1
            ? prev.findIndex(
                (p) =>
                  p.pending &&
                  p.senderId === msg.senderId &&
                  p.content === msg.content
              )
            : -1;

        if (evt.type === "deleted") {
          if (existingIdx >= 0) {
            const copy = prev.slice();
            copy.splice(existingIdx, 1);
            console.debug("[space-messaging] removed message", id);
            return copy;
          }
          return prev;
        }

        if (evt.type === "updated") {
          if (existingIdx >= 0) {
            const copy = prev.slice();
            copy[existingIdx] = { ...toUi(msg) };
            console.debug("[space-messaging] updated message", id);
            return copy;
          }
          if (pendingIdx >= 0) {
            const copy = prev.slice();
            copy[pendingIdx] = { ...toUi(msg) };
            console.debug(
              "[space-messaging] replaced pending with updated",
              id
            );
            return copy;
          }
          return [...prev, toUi(msg)];
        }

        // created
        if (existingIdx === -1 && !seenIdsRef.current.has(id)) {
          seenIdsRef.current.add(id);
          if (pendingIdx >= 0) {
            const copy = prev.slice();
            copy[pendingIdx] = { ...toUi(msg) };
            console.debug(
              "[space-messaging] replaced pending with created",
              id
            );
            return copy;
          }
          console.debug("[space-messaging] appended new message", id);
          return [...prev, toUi(msg)];
        }
        return prev;
      });
    });

    return () => {
      try {
        if (joined) {
          console.debug("[space-messaging] leaving space", spaceId);
          socket.emit("leave_space", { spaceId });
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

  // ─────────────────────────  AUTO-SCROLL  ─────────────────────────
  const scrollAreaRefFull = useRef<HTMLDivElement | null>(null);
  const scrollAreaRefEmbedded = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneRef = useRef(false);

  const scrollToBottom = (smooth: boolean) => {
    requestAnimationFrame(() => {
      // Only scroll the currently active view to prevent flickering
      const activeRef = isFullScreen ? scrollAreaRefFull : scrollAreaRefEmbedded;
      const scrollContainer = activeRef.current?.querySelector('[data-radix-scroll-area-viewport]');

      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    });
  };

  useEffect(() => {
    if (!messages.length) return;
    if (!initialScrollDoneRef.current) {
      // First time we have messages -> jump instantly
      scrollToBottom(false);
      initialScrollDoneRef.current = true;
    } else {
      // Subsequent additions -> smooth scroll
      scrollToBottom(true);
    }
  }, [messages.length, isFullScreen]);

  return (
    <>
      {/* Full-screen overlay */}
      {isFullScreen && (
        <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-3">
            {!forceFullScreen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="rounded-full"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 via-teal-500 to-blue-500 flex items-center justify-center text-white text-sm font-bold shadow-md">
              {spaceName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base text-gray-900">
                {spaceName}
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                {spaceId.slice(0, 12)}...
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={showChatPanel ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowChatPanel(!showChatPanel)}
                className="rounded-full"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              {spaceDetails && (
                <SpaceInfoDialog
                  spaceDetails={spaceDetails}
                  trigger={
                    <Button variant="ghost" size="sm" className="rounded-full">
                      <Info className="h-4 w-4" />
                    </Button>
                  }
                />
              )}
              {!forceFullScreen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullScreen}
                  className="rounded-full"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Full-screen content: Media primary, Chat collapsible - Both aligned */}
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
                onLeaveSpace={onBack}
              />
            </div>

            {/* Chat Panel (collapsible sidebar) - Modern Discord-inspired design */}
            {showChatPanel && (
              <div
                className={`border border-gray-400 m-2 rounded-xl bg-white transition-all duration-300 shadow-2xl ${
                  isChatExpanded
                    ? "w-full h-full absolute inset-0 z-10"
                    : "w-96 h-full flex-shrink-0"
                }`}
              >
                {isChatExpanded && (
                  <div className="absolute top-4 right-4 z-20">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsChatExpanded(false)}
                      className="rounded-full shadow-lg"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex flex-col h-full rounded-xl">
                  {/* Chat header */}
                  <div className="px-4 py-3 border-b rounded-t-xl">
                    <h4 className="font-semibold text-sm text-gray-900">
                      Chat
                    </h4>
                  </div>

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

                  {/* Messages area with improved styling */}
                  <ScrollArea ref={scrollAreaRefFull} className="flex-1 bg-gradient-to-b from-white to-gray-50">
                    <div className="p-4 space-y-1">
                      {messages.map((message, index) => (
                        <SpaceMessage
                          key={message.messageId || index}
                          senderId={message.senderId || "unknown"}
                          senderType={message.senderType || "agent"}
                          content={message.content}
                          timestamp={message.timestamp}
                          metadata={message.metadata}
                        />
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Input area */}
                  {spaceDetails && (
                    <div className="rounded-b-xl">
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

          {/* Embedded header with buttons - Modern design */}
          <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white flex items-center gap-3 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 via-teal-500 to-blue-500 flex items-center justify-center text-white text-sm font-bold shadow-md">
              {spaceName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-gray-900">
                {spaceName}
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                {spaceId.slice(0, 12)}...
              </p>
            </div>
            <div className="flex gap-2">
              {spaceDetails && (
                <SpaceInfoDialog
                  spaceDetails={spaceDetails}
                  trigger={
                    <Button variant="ghost" size="sm" className="rounded-full">
                      <Info className="h-4 w-4" />
                    </Button>
                  }
                />
              )}
              {!forceFullScreen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullScreen}
                  className="rounded-full"
                >
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
          <ScrollArea ref={scrollAreaRefEmbedded} className="p-4 h-[380px] bg-gray-50 rounded-b-xl">
            <div className="container mx-auto max-w-2xl">
              {messages.map((message, index) => (
                <SpaceMessage
                  key={message.messageId || index}
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
            <div className="rounded-b-xl">
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
