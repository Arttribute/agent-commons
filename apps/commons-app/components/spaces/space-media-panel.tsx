"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Maximize2, Minimize2, Grid3X3, Users, Video } from "lucide-react";
import { useSpaceRTC } from "@/hooks/use-space-rtc";
import { useActiveSpeaker } from "@/hooks/use-active-speaker";
import { useLocalAudioLevel } from "@/hooks/use-local-audio-level";
import { StreamCard } from "./stream-card";
import {
  calculateGridLayout,
  sortStreamsByPriority,
  getGridStyle,
} from "@/lib/space-layout-utils";
import { SpaceMediaControls } from "./space-media-controls";

// StreamCard component is now imported from ./stream-card.tsx

export default function SpaceMediaPanel({
  spaceId,
  selfId,
  role,
  wsUrl,
  expectedPeers,
  isExpanded = false,
  onToggleExpanded,
  onLeaveSpace,
}: {
  spaceId: string;
  selfId: string;
  role: "human" | "agent";
  wsUrl: string;
  expectedPeers?: Array<{ id: string; role: "human" | "agent" }>;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onLeaveSpace?: () => void;
}) {
  const {
    localStream: localStream,
    localScreenStream,
    localWebUrl,
    remotePeers,
    joined,
    pubState,
    togglePublish: hookTogglePublish,
    compositeFrameUrl,
    endWebCapture,
  } = useSpaceRTC({
    spaceId,
    selfId,
    role,
    wsBase: wsUrl,
  });

  const pubAudio = pubState.audio;
  const pubVideo = pubState.video;
  const pubScreen = pubState.screen;
  const pubUrl = pubState.url;

  // Log publish state for debugging
  console.log("Publish state:", { pubAudio, pubVideo, pubScreen, pubUrl });
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [urlInputValue, setUrlInputValue] = useState<string>("");
  const [focusedPeer, setFocusedPeer] = useState<string | null>(null);
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());

  // Track local user's audio level
  const localAudioLevel = useLocalAudioLevel({
    localStream: localStream,
    isPublishingAudio: pubAudio,
  });

  // Track active speaker across all participants
  const allParticipants = [
    {
      id: selfId,
      audioLevel: localAudioLevel.audioLevel,
      isSpeaking: localAudioLevel.isSpeaking && pubAudio,
    },
    ...remotePeers.map((peer) => ({
      id: peer.id,
      audioLevel: peer.audioLevel || 0,
      isSpeaking: peer.isSpeaking || false,
    })),
  ];

  const activeSpeakerId = useActiveSpeaker({
    participants: allParticipants,
    activationDelay: 300,
    deactivationDelay: 800,
  });

  async function togglePublish(kind: "audio" | "video" | "screen" | "url") {
    if (kind === "url") {
      if (!pubUrl) {
        // open input dialog
        setShowUrlInput(true);
        return;
      }
      // turning off
      await hookTogglePublish("url");
      setCurrentUrl("");
      return;
    }
    await hookTogglePublish(kind);
  }

  const handleEndWebGracefully = async () => {
    console.log(
      "handleEndWebGracefully called, endWebCapture:",
      endWebCapture,
      "pubUrl:",
      pubUrl
    );

    // Signal graceful shutdown to backend (shows ending overlay)
    endWebCapture?.(1500); // default 1.5s grace

    // Wait for grace period, then actually stop the URL share
    setTimeout(async () => {
      console.log("Grace period ended, stopping URL share");
      setCurrentUrl(""); // Clear the current URL
      await togglePublish("url");
    }, 1500);
  };

  const handleUrlSubmit = async (url?: string) => {
    // If URL is passed directly (from dialog), use it; otherwise use urlInputValue
    const inputUrl = url || urlInputValue.trim();
    if (!inputUrl) return;

    const normalized = inputUrl.startsWith("http")
      ? inputUrl.trim()
      : `https://${inputUrl.trim()}`;

    console.log("handleUrlSubmit called with:", { url, inputUrl, normalized });
    setCurrentUrl(normalized);
    setShowUrlInput(false);
    setUrlInputValue("");
    await hookTogglePublish("url", normalized);
  };

  const handleCancelUrl = () => {
    setShowUrlInput(false);
    setUrlInputValue("");
  };

  const toggleMutePeer = (peerId: string) => {
    const newMuted = new Set(mutedPeers);
    if (newMuted.has(peerId)) {
      newMuted.delete(peerId);
    } else {
      newMuted.add(peerId);
    }
    setMutedPeers(newMuted);
  };

  const handleStreamFocus = (peerId: string) => {
    if (!isExpanded && onToggleExpanded) {
      onToggleExpanded();
    }
    setFocusedPeer(peerId);
  };

  // Build all streams including URL shares
  type StreamItem = {
    id: string;
    role: "human" | "agent";
    stream: MediaStream | null | undefined;
    audioStream: MediaStream | null | undefined;
    audioSrc?: string;
    frameUrl?: string; // data URL for camera/screen/web when no MediaStream available
    publish: { audio: boolean; video: boolean };
    isLocal: boolean;
    isScreenShare: boolean;
    isUrlShare: boolean;
    url?: string;
    webFrameUrl?: string;
    ending?: boolean;
    endsAt?: number;
  };

  const allStreams: StreamItem[] = [];
  const addedIds = new Set<string>(); // Track added IDs to prevent duplicates

  // Log remote peers data for debugging
  console.log(
    "Remote peers data:",
    remotePeers.map((p) => ({
      id: p.id,
      urlSharing: p.urlSharing,
      webFrameUrl: p.webFrameUrl,
      allFrameData: {
        cameraFrameUrl: (p as any).cameraFrameUrl,
        screenFrameUrl: (p as any).screenFrameUrl,
        webFrameUrl: p.webFrameUrl,
      },
    }))
  );

  // Helper to safely add stream
  const addStream = (stream: StreamItem) => {
    if (!addedIds.has(stream.id)) {
      allStreams.push(stream);
      addedIds.add(stream.id);
    }
  };

  // Always add a self tile even if not publishing (placeholder)
  addStream({
    id: selfId,
    role,
    stream:
      (pubAudio || pubVideo) && localStream.current
        ? localStream.current
        : null,
    audioStream: undefined,
    publish: { audio: pubAudio, video: pubVideo },
    isLocal: true,
    isScreenShare: false,
    isUrlShare: false,
  });

  // Note: self tile already added above

  // Add local screen share
  if (pubScreen && localScreenStream.current) {
    addStream({
      id: `${selfId}-screen`,
      role,
      stream: localScreenStream.current,
      audioStream: undefined,
      publish: { audio: false, video: true },
      isLocal: true,
      isScreenShare: true,
      isUrlShare: false,
    });
  }

  // Add local URL share
  // First check if we have a webFrameUrl from remotePeers (server sends our own frames back)
  const selfPeer = remotePeers.find((p) => p.id === selfId);
  const localWebFrameUrl = selfPeer?.webFrameUrl;

  if (pubUrl && (localWebUrl || localWebFrameUrl)) {
    console.log("Adding local URL share stream:", {
      localWebUrl,
      localWebFrameUrl,
      compositeFrameUrl,
      pubUrl,
    });
    addStream({
      id: `${selfId}-url`,
      role,
      stream: undefined,
      audioStream: undefined,
      frameUrl: localWebFrameUrl, // Use specific web frame, not composite
      publish: { audio: false, video: true },
      isLocal: true,
      isScreenShare: false,
      isUrlShare: true,
      url: localWebUrl || undefined,
      webFrameUrl: localWebFrameUrl, // Use specific web frame, not composite
    });
  }

  // Add remote streams
  remotePeers.forEach((peer) => {
    // Skip if this is actually the self participant (sometimes comes through remotePeers)
    if (peer.id === selfId) {
      return; // Already added as local
    }

    // Add regular participant tile for all non-self peers so they always appear
    addStream({
      id: peer.id,
      role: peer.role,
      stream: peer.stream,
      audioStream: peer.audioStream || null,
      audioSrc: (peer as any).audioSrc,
      frameUrl: (peer as any).cameraFrameUrl,
      publish: (peer as any).publishing ?? {
        audio: false,
        video: !!(peer as any).cameraFrameUrl,
      },
      isLocal: false,
      isScreenShare: false,
      isUrlShare: false,
    });

    // Add screen share stream (skip if it's from self - already added locally)
    if (
      (peer.screenStream || (peer as any).screenFrameUrl) &&
      peer.id !== selfId
    ) {
      addStream({
        id: `${peer.id}-screen`,
        role: peer.role,
        stream: peer.screenStream,
        audioStream: undefined,
        frameUrl: (peer as any).screenFrameUrl,
        publish: { audio: false, video: true },
        isLocal: false,
        isScreenShare: true,
        isUrlShare: false,
      });
    }

    // Add URL share stream (can include self since we don't add it locally above)
    if (peer.urlSharing?.active || peer.webFrameUrl) {
      console.log("Adding URL share stream:", {
        peerId: peer.id,
        urlSharing: peer.urlSharing,
        webFrameUrl: peer.webFrameUrl,
      });
      addStream({
        id: `${peer.id}-url`,
        role: peer.role,
        stream: undefined,
        audioStream: undefined,
        frameUrl: peer.webFrameUrl,
        publish: { audio: false, video: true },
        isLocal: peer.id === selfId,
        isScreenShare: false,
        isUrlShare: true,
        url: peer.urlSharing?.url,
        webFrameUrl: peer.webFrameUrl,
        ending: peer.urlSharing?.ending,
        endsAt: peer.urlSharing?.endsAt,
      });
    }
  });

  // Ensure expectedPeers are present as placeholders
  if (expectedPeers && expectedPeers.length) {
    for (const p of expectedPeers) {
      if (!addedIds.has(p.id)) {
        addStream({
          id: p.id,
          role: p.role,
          stream: null,
          audioStream: null,
          publish: { audio: false, video: false },
          isLocal: p.id === selfId,
          isScreenShare: false,
          isUrlShare: false,
        });
      }
    }
  }

  const totalActiveStreams = allStreams.length;
  const shouldShowPanel = totalActiveStreams > 0 || joined;

  // Use improved layout calculation
  const gridLayout = calculateGridLayout(totalActiveStreams, isExpanded);
  const sortedStreams = sortStreamsByPriority(allStreams);

  if (!shouldShowPanel) {
    return (
      <div className="flex flex-col h-full border-l bg-gradient-to-b from-gray-50 to-white">
        <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-600">Media</span>
              {!joined && (
                <Badge variant="outline" className="animate-pulse">
                  Connecting...
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center text-gray-500 max-w-xs">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Video className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              No active streams
            </p>
            <p className="text-xs text-gray-500">
              Start your camera, mic, or screen share to begin
            </p>
            {compositeFrameUrl && (
              <div className="mt-6">
                <img
                  src={compositeFrameUrl}
                  alt="Composite"
                  className="max-w-[180px] mx-auto rounded-lg border shadow-sm"
                />
              </div>
            )}
          </div>
        </div>
        <SpaceMediaControls
          pubAudio={pubAudio}
          pubVideo={pubVideo}
          pubScreen={pubScreen}
          pubUrl={pubUrl}
          onTogglePublish={togglePublish}
          onUrlSubmit={handleUrlSubmit}
          onEndWebGracefully={handleEndWebGracefully}
          onLeaveSpace={onLeaveSpace}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full border-l bg-slate-50 ${isExpanded ? "w-full" : ""}`}
    >
      {/* Header - Modern design */}
      {/* <div className="">
        <div className="flex items-center justify-between">
         <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold text-green-700">
                {totalActiveStreams}
              </span>
            </div>
            {!joined && (
              <Badge variant="outline" className="animate-pulse">
                Connecting...
              </Badge>
            )}
            {compositeFrameUrl && (
              <img
                src={compositeFrameUrl}
                alt="Composite"
                className="h-8 w-12 object-cover rounded-md border shadow-sm"
              />
            )}
          </div> 

          {focusedPeer && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFocusedPeer(null)}
              className="rounded-full"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
          )}
          {onToggleExpanded && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleExpanded}
              className="rounded-full"
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div> */}

      {/* Streams */}
      <div className="flex-1 overflow-hidden flex items-center justify-center">
        {focusedPeer ? (
          // Focused view - Google Meet / Discord Huddle style
          <div className="h-full w-full flex flex-col p-4 gap-3">
            {/* Main focused stream - takes most space, properly sized */}
            <div className="flex-1 flex items-center justify-center min-h-0">
              {(() => {
                const focusedStream = allStreams.find(
                  (s) => s.id === focusedPeer
                );
                if (!focusedStream) return null;

                return (
                  <div className="w-full h-full max-w-7xl flex items-center justify-center">
                    <div className="w-full h-full max-h-full">
                      <StreamCard
                        peer={{
                          id: focusedStream.id,
                          role: focusedStream.role,
                          stream: focusedStream.stream || undefined,
                          audioStream: focusedStream.audioStream || undefined,
                          audioSrc: focusedStream.audioSrc,
                          publish: focusedStream.publish,
                          isScreenShare: focusedStream.isScreenShare,
                          isUrlShare: focusedStream.isUrlShare,
                          url: focusedStream.url,
                          webFrameUrl: focusedStream.webFrameUrl,
                          ending: focusedStream.ending,
                          endsAt: focusedStream.endsAt,
                        }}
                        isLocal={focusedStream.isLocal}
                        isFocused={true}
                        onMute={
                          focusedStream.isLocal
                            ? undefined
                            : () => toggleMutePeer(focusedStream.id)
                        }
                        isMuted={mutedPeers.has(focusedStream.id)}
                        isActiveSpeaker={activeSpeakerId === focusedStream.id}
                        activeSpeakerId={activeSpeakerId}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Thumbnails - compact row at bottom, no border */}
            {sortedStreams.filter((s) => s.id !== focusedPeer).length > 0 && (
              <div className="flex-shrink-0">
                <ScrollArea className="w-full">
                  <div className="flex gap-2 justify-center pb-1">
                    {sortedStreams
                      .filter((s) => s.id !== focusedPeer)
                      .map((stream) => (
                        <div
                          key={stream.id}
                          className="flex-shrink-0 w-28 cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => setFocusedPeer(stream.id)}
                        >
                          <StreamCard
                            peer={{
                              id: stream.id,
                              role: stream.role,
                              stream: stream.stream || undefined,
                              audioStream: stream.audioStream || undefined,
                              audioSrc: stream.audioSrc,
                              publish: stream.publish,
                              isScreenShare: stream.isScreenShare,
                              isUrlShare: stream.isUrlShare,
                              url: stream.url,
                              webFrameUrl: stream.webFrameUrl,
                              ending: stream.ending,
                              endsAt: stream.endsAt,
                            }}
                            isLocal={stream.isLocal}
                            isMinimized={true}
                            onMute={
                              stream.isLocal
                                ? undefined
                                : () => toggleMutePeer(stream.id)
                            }
                            isMuted={mutedPeers.has(stream.id)}
                            isActiveSpeaker={activeSpeakerId === stream.id}
                            activeSpeakerId={activeSpeakerId}
                          />
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        ) : (
          // Grid view - Google Meet style with flexible card dimensions
          <div className="h-full w-full p-4">
            {(() => {
              // Check if there's a primary stream that should be spotlighted
              const primary = sortedStreams.find(
                (s) => s.isUrlShare || s.isScreenShare
              );

              if (primary) {
                // Spotlight layout: primary stream takes most space, others in bottom bar (Google Meet style)
                const others = sortedStreams.filter((s) => s.id !== primary.id);

                return (
                  <div className="h-full flex flex-col gap-3">
                    {/* Primary spotlighted stream - takes majority of space */}
                    <div className="flex-1 flex items-center justify-center min-h-0">
                      <StreamCard
                        peer={{
                          id: primary.id,
                          role: primary.role,
                          stream: primary.stream || undefined,
                          audioStream: primary.audioStream || undefined,
                          audioSrc: primary.audioSrc,
                          publish: primary.publish,
                          isScreenShare: primary.isScreenShare,
                          isUrlShare: primary.isUrlShare,
                          url: primary.url,
                          webFrameUrl: primary.webFrameUrl,
                          ending: primary.ending,
                          endsAt: primary.endsAt,
                        }}
                        isLocal={primary.isLocal}
                        isFocused={true}
                        onFocus={() => setFocusedPeer(primary.id)}
                        onMute={
                          primary.isLocal
                            ? undefined
                            : () => toggleMutePeer(primary.id)
                        }
                        isMuted={mutedPeers.has(primary.id)}
                        isActiveSpeaker={activeSpeakerId === primary.id}
                        activeSpeakerId={activeSpeakerId}
                        className="w-full h-full max-w-7xl"
                      />
                    </div>

                    {/* Other participants - bottom bar (Google Meet style) */}
                    {others.length > 0 && (
                      <div className="flex-shrink-0">
                        <div className="flex gap-2 justify-center overflow-x-auto pb-1">
                          {others.map((stream) => (
                            <div
                              key={stream.id}
                              className="flex-shrink-0 w-32 cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => handleStreamFocus(stream.id)}
                            >
                              <StreamCard
                                peer={{
                                  id: stream.id,
                                  role: stream.role,
                                  stream: stream.stream || undefined,
                                  audioStream: stream.audioStream || undefined,
                                  audioSrc: stream.audioSrc,
                                  publish: stream.publish,
                                  isScreenShare: stream.isScreenShare,
                                  isUrlShare: stream.isUrlShare,
                                  url: stream.url,
                                  webFrameUrl: stream.webFrameUrl,
                                  ending: stream.ending,
                                  endsAt: stream.endsAt,
                                }}
                                isLocal={stream.isLocal}
                                isMinimized={true}
                                onMute={
                                  stream.isLocal
                                    ? undefined
                                    : () => toggleMutePeer(stream.id)
                                }
                                isMuted={mutedPeers.has(stream.id)}
                                isActiveSpeaker={activeSpeakerId === stream.id}
                                activeSpeakerId={activeSpeakerId}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Equal grid layout - fills entire space
              return (
                <div className="h-full flex items-center justify-center">
                  <div
                    className="grid gap-3 w-full h-full"
                    style={{
                      ...getGridStyle(gridLayout.columns),
                      gridAutoRows: "1fr", // Make rows equal height
                    }}
                  >
                    {sortedStreams.map((stream) => (
                      <StreamCard
                        key={stream.id}
                        peer={{
                          id: stream.id,
                          role: stream.role,
                          stream: stream.stream || undefined,
                          audioStream: stream.audioStream || undefined,
                          audioSrc: stream.audioSrc,
                          publish: stream.publish,
                          isScreenShare: stream.isScreenShare,
                          isUrlShare: stream.isUrlShare,
                          url: stream.url,
                          webFrameUrl: stream.webFrameUrl,
                          ending: stream.ending,
                          endsAt: stream.endsAt,
                        }}
                        isLocal={stream.isLocal}
                        onFocus={() => handleStreamFocus(stream.id)}
                        onMute={
                          stream.isLocal
                            ? undefined
                            : () => toggleMutePeer(stream.id)
                        }
                        isMuted={mutedPeers.has(stream.id)}
                        isActiveSpeaker={activeSpeakerId === stream.id}
                        activeSpeakerId={activeSpeakerId}
                        className="w-full h-full min-h-0"
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Controls */}
      <SpaceMediaControls
        pubAudio={pubAudio}
        pubVideo={pubVideo}
        pubScreen={pubScreen}
        pubUrl={pubUrl}
        onTogglePublish={togglePublish}
        onUrlSubmit={handleUrlSubmit}
        onEndWebGracefully={handleEndWebGracefully}
        onLeaveSpace={onLeaveSpace}
      />
    </div>
  );
}
