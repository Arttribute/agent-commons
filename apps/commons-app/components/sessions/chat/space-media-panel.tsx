"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Camera,
  Mic,
  MicOff,
  CameraOff,
  Monitor,
  MonitorOff,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Grid3X3,
  Users,
  Globe,
  GlobeLock,
  Plus,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { useSpaceRTC } from "@/hooks/use-space-rtc";

interface StreamCardProps {
  peer: {
    id: string;
    role: "human" | "agent";
    stream?: MediaStream;
    audioStream?: MediaStream;
    audioSrc?: string;
    frameUrl?: string;
    publish: { audio: boolean; video: boolean };
    isScreenShare?: boolean;
    isUrlShare?: boolean;
    url?: string;
    webFrameUrl?: string; // latest server web capture frame
    ending?: boolean;
    endsAt?: number;
  };
  isLocal?: boolean;
  isFocused?: boolean;
  isMinimized?: boolean;
  onFocus?: () => void;
  onMute?: () => void;
  isMuted?: boolean;
  className?: string;
}

function StreamCard({
  peer,
  isLocal = false,
  isFocused = false,
  isMinimized = false,
  onFocus,
  onMute,
  isMuted = false,
  className = "",
}: StreamCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  useEffect(() => {
    if (audioRef.current && peer.audioStream) {
      audioRef.current.srcObject = peer.audioStream as any;
    }
  }, [peer.audioStream]);

  // Fallback: if no MediaStream provided but an audioSrc is available, bind it
  useEffect(() => {
    if (!audioRef.current) return;
    if (peer.audioStream) return; // already using stream
    if (peer.audioSrc) {
      try {
        audioRef.current.srcObject = null;
      } catch {}
      // Force rebind even if same string
      const el = audioRef.current;
      try {
        el.pause();
      } catch {}
      el.src = "";
      // yield to event loop to ensure detach
      setTimeout(() => {
        try {
          el.src = peer.audioSrc as string;
          if (process.env.NEXT_PUBLIC_TTS_DEBUG === "true") {
            console.debug("[TTS] bind audio element", {
              id: peer.id,
              srcLen: (peer.audioSrc as string).length,
            });
            el.onplay = () => console.debug("[TTS] onplay", peer.id);
            el.onpause = () => console.debug("[TTS] onpause", peer.id);
            el.onended = () => console.debug("[TTS] onended", peer.id);
            el.onloadedmetadata = () =>
              console.debug("[TTS] onloadedmetadata", peer.id, el.duration);
            el.onerror = (e) => console.debug("[TTS] onerror", peer.id, e);
          }
          el.load();
          // Attempt playback (may be blocked until user gesture; best effort)
          el.play().catch(() => {});
        } catch {}
      }, 0);
    } else {
      try {
        const el = audioRef.current;
        el.pause?.();
        el.src = "";
        el.srcObject = null;
      } catch {}
    }
  }, [peer.audioSrc, peer.audioStream]);

  const getAvatarColor = (id: string) => {
    const colors = [
      "bg-purple-500",
      "bg-green-500",
      "bg-orange-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-teal-500",
    ];
    const hash = id.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const aspectRatio = isMinimized
    ? "aspect-video"
    : isFocused
      ? "aspect-video"
      : "aspect-video";

  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-gray-900 ${aspectRatio} ${
        isFocused ? "ring-2 ring-blue-500" : ""
      } ${onFocus ? "cursor-pointer" : ""} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onFocus}
    >
      {peer.isUrlShare && (peer.webFrameUrl || peer.frameUrl) ? (
        <img
          src={peer.webFrameUrl || (peer.frameUrl as string)}
          alt={peer.url || "web"}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : peer.stream && (peer.publish.video || peer.isScreenShare) ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : peer.frameUrl && (peer.publish.video || peer.isScreenShare) ? (
        <img
          src={peer.frameUrl}
          alt={peer.isScreenShare ? "screen" : "camera"}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center ${getAvatarColor(peer.id)}`}
        >
          <div
            className="text-white font-bold"
            style={{ fontSize: isMinimized ? "12px" : "24px" }}
          >
            {peer.role === "agent" ? "A" : "H"}
          </div>
        </div>
      )}

      {/* Ending fade overlay for graceful shutdown */}
      {peer.isUrlShare && peer.ending && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 animate-pulse">
          <span className="text-white text-sm font-medium">
            Ending web share…
          </span>
        </div>
      )}

      {/* Hidden audio element to play separate audio-only streams */}
      {(peer.audioStream || peer.audioSrc) && (
        <audio
          ref={audioRef}
          autoPlay
          muted={isLocal || isMuted}
          key={peer.audioSrc ? peer.audioSrc.slice(-16) : "nosrc"}
          className="hidden"
        />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
        {/* Bottom info */}
        <div className="absolute bottom-1 left-1 flex items-center gap-1">
          {!isMinimized && (
            <>
              <Badge
                variant={peer.role === "agent" ? "default" : "secondary"}
                className="text-xs"
              >
                {peer.role}
              </Badge>
              {peer.isScreenShare && (
                <Badge
                  variant="outline"
                  className="text-xs bg-blue-500 text-white border-blue-500"
                >
                  <Monitor className="h-3 w-3 mr-1" />
                  Screen
                </Badge>
              )}
              {peer.isUrlShare && (
                <Badge
                  variant="outline"
                  className="text-xs bg-green-500 text-white border-green-500"
                >
                  <Globe className="h-3 w-3 mr-1" />
                  Web
                </Badge>
              )}
              <span className="text-white text-xs font-medium">
                {isLocal ? "You" : `${peer.role}-${peer.id.slice(0, 4)}`}
              </span>
            </>
          )}
        </div>

        {/* URL info */}
        {peer.isUrlShare && peer.url && !isMinimized && (
          <div className="absolute top-1 left-1 bg-black/70 rounded px-2 py-1">
            <span className="text-white text-xs">
              {peer.url.length > 30 ? `${peer.url.slice(0, 30)}...` : peer.url}
            </span>
          </div>
        )}

        {/* Status indicators */}
        <div className="absolute bottom-1 right-1 flex items-center gap-1">
          {!peer.isScreenShare && !peer.isUrlShare && (
            <>
              {peer.publish.audio ? (
                <Mic
                  className={`text-green-400 ${isMinimized ? "h-3 w-3" : "h-4 w-4"}`}
                />
              ) : (
                <MicOff
                  className={`text-red-400 ${isMinimized ? "h-3 w-3" : "h-4 w-4"}`}
                />
              )}
              {!peer.publish.video && (
                <CameraOff
                  className={`text-red-400 ${isMinimized ? "h-3 w-3" : "h-4 w-4"}`}
                />
              )}
            </>
          )}
          {peer.isScreenShare && (
            <Monitor
              className={`text-blue-400 ${isMinimized ? "h-3 w-3" : "h-4 w-4"}`}
            />
          )}
          {peer.isUrlShare && (
            <Globe
              className={`text-green-400 ${isMinimized ? "h-3 w-3" : "h-4 w-4"}`}
            />
          )}
        </div>

        {/* Hover controls */}
        {isHovered && !isLocal && !isMinimized && (
          <div className="absolute top-1 right-1 flex gap-1">
            {onMute && !peer.isScreenShare && !peer.isUrlShare && (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 w-6 p-0 bg-black/50 hover:bg-black/70"
                onClick={(e) => {
                  e.stopPropagation();
                  onMute();
                }}
              >
                {isMuted ? (
                  <VolumeX className="h-3 w-3" />
                ) : (
                  <Volume2 className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpaceMediaPanel({
  spaceId,
  selfId,
  role,
  wsUrl,
  expectedPeers,
  isExpanded = false,
  onToggleExpanded,
}: {
  spaceId: string;
  selfId: string;
  role: "human" | "agent";
  wsUrl: string;
  expectedPeers?: Array<{ id: string; role: "human" | "agent" }>;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
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
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [urlInputValue, setUrlInputValue] = useState<string>("");
  const [focusedPeer, setFocusedPeer] = useState<string | null>(null);
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());

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

  const handleEndWebGracefully = () => {
    endWebCapture?.(1500); // default 1.5s grace
  };

  const handleUrlSubmit = async () => {
    if (!urlInputValue.trim()) return;
    const normalized = urlInputValue.startsWith("http")
      ? urlInputValue.trim()
      : `https://${urlInputValue.trim()}`;
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

  // Always add a self tile even if not publishing (placeholder)
  allStreams.push({
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
    allStreams.push({
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
  // Do not push a local placeholder for web capture; rely on server frames (including self) via remotePeers

  // Add remote streams
  remotePeers.forEach((peer) => {
    // Add regular participant tile for all non-self peers so they always appear
    if (peer.id !== selfId) {
      allStreams.push({
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
    }

    // Add screen share stream
    if (peer.screenStream || (peer as any).screenFrameUrl) {
      allStreams.push({
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

    // Add URL share stream
    if (peer.urlSharing?.active || peer.webFrameUrl) {
      allStreams.push({
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
    const present = new Set(allStreams.map((s) => s.id));
    for (const p of expectedPeers) {
      if (!present.has(p.id)) {
        allStreams.push({
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
  const getColumns = () => {
    if (isExpanded) {
      if (totalActiveStreams <= 4) return 2;
      if (totalActiveStreams <= 9) return 3;
      return 4;
    }
    return 1;
  };

  const columns = getColumns();

  if (!shouldShowPanel) {
    return (
      <div className="flex flex-col h-full border-l bg-gray-50">
        <div className="p-3 border-b bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Media</span>
              {!joined && <Badge variant="outline">Connecting...</Badge>}
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-gray-500">
            <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active streams</p>
            <p className="text-xs text-gray-400">
              Start streaming to see participants
            </p>
            {compositeFrameUrl && (
              <div className="mt-4">
                <ImageIcon className="h-4 w-4 mx-auto mb-1 text-gray-400" />
                <img
                  src={compositeFrameUrl}
                  alt="Composite"
                  className="max-w-[160px] mx-auto rounded border"
                />
              </div>
            )}
          </div>
        </div>
        <div className="p-3 border-t bg-white">
          {showUrlInput ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter website URL (e.g., example.com)"
                  value={urlInputValue}
                  onChange={(e) => setUrlInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleUrlSubmit()}
                  className="text-sm"
                />
                <Button size="sm" onClick={handleUrlSubmit}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelUrl}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center gap-2">
              <Button
                size="sm"
                variant={pubAudio ? "default" : "outline"}
                onClick={() => togglePublish("audio")}
              >
                {pubAudio ? (
                  <Mic className="h-4 w-4" />
                ) : (
                  <MicOff className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant={pubVideo ? "default" : "outline"}
                onClick={() => togglePublish("video")}
              >
                {pubVideo ? (
                  <Camera className="h-4 w-4" />
                ) : (
                  <CameraOff className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant={pubScreen ? "default" : "outline"}
                onClick={() => togglePublish("screen")}
              >
                {pubScreen ? (
                  <Monitor className="h-4 w-4" />
                ) : (
                  <MonitorOff className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant={pubUrl ? "default" : "outline"}
                onClick={() => togglePublish("url")}
              >
                {pubUrl ? (
                  <Globe className="h-4 w-4" />
                ) : (
                  <GlobeLock className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full border-l bg-white ${isExpanded ? "w-full" : ""}`}
    >
      {/* Header */}
      <div className="p-3 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">
              Live ({totalActiveStreams})
            </span>
            {!joined && <Badge variant="outline">Connecting...</Badge>}
            {compositeFrameUrl && (
              <img
                src={compositeFrameUrl}
                alt="Composite"
                className="h-8 w-12 object-cover rounded border ml-2"
              />
            )}
          </div>
          <div className="flex items-center gap-1">
            {focusedPeer && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFocusedPeer(null)}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            )}
            {onToggleExpanded && (
              <Button size="sm" variant="ghost" onClick={onToggleExpanded}>
                {isExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Streams */}
      <div className="flex-1 overflow-hidden">
        {focusedPeer ? (
          // Focused view
          <div className="h-full flex flex-col">
            <div className="flex-1 p-3">
              {(() => {
                const focusedStream = allStreams.find(
                  (s) => s.id === focusedPeer
                );
                if (!focusedStream) return null;

                return (
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
                    className="h-[500px]"
                  />
                );
              })()}
            </div>
            {/* Thumbnails */}
            <div className="p-2 border-t bg-gray-50">
              <ScrollArea className="w-full">
                <div className="flex gap-2">
                  {allStreams
                    .filter((s) => s.id !== focusedPeer)
                    .map((stream) => (
                      <div
                        key={stream.id}
                        className="flex-shrink-0 w-16 cursor-pointer"
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
                        />
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        ) : (
          // Grid view
          <ScrollArea className="h-full">
            {(() => {
              // Determine primary stream: any url share first, else any screen share
              const primary =
                allStreams.find((s) => s.isUrlShare) ||
                allStreams.find((s) => s.isScreenShare);
              if (!primary) {
                // fallback original grid
                return (
                  <div
                    className={`p-3 grid gap-3`}
                    style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
                  >
                    {allStreams.map((stream) => (
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
                      />
                    ))}
                  </div>
                );
              }
              const others = allStreams.filter((s) => s.id !== primary.id);
              return (
                <div className="p-3 flex flex-col gap-3">
                  <div className="w-full aspect-video">
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
                      onFocus={() => handleStreamFocus(primary.id)}
                      onMute={
                        primary.isLocal
                          ? undefined
                          : () => toggleMutePeer(primary.id)
                      }
                      isMuted={mutedPeers.has(primary.id)}
                      className="h-full"
                    />
                  </div>
                  {others.length > 0 && (
                    <div
                      className="grid gap-3"
                      style={{
                        gridTemplateColumns: `repeat(${Math.min(4, Math.ceil(Math.sqrt(others.length)))}, 1fr)`,
                      }}
                    >
                      {others.map((stream) => (
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
                          className="aspect-video"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </ScrollArea>
        )}
      </div>

      {/* Controls */}
      <div className="p-3 border-t bg-white">
        {showUrlInput ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Enter website URL (e.g., example.com)"
                value={urlInputValue}
                onChange={(e) => setUrlInputValue(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleUrlSubmit()}
                className="text-sm"
              />
              <Button size="sm" onClick={handleUrlSubmit}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelUrl}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center gap-2">
            <Button
              size="sm"
              variant={pubAudio ? "default" : "outline"}
              onClick={() => togglePublish("audio")}
            >
              {pubAudio ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant={pubVideo ? "default" : "outline"}
              onClick={() => togglePublish("video")}
            >
              {pubVideo ? (
                <Camera className="h-4 w-4" />
              ) : (
                <CameraOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant={pubScreen ? "default" : "outline"}
              onClick={() => togglePublish("screen")}
            >
              {pubScreen ? (
                <Monitor className="h-4 w-4" />
              ) : (
                <MonitorOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant={pubUrl ? "default" : "outline"}
              onClick={() => togglePublish("url")}
            >
              {pubUrl ? (
                <Globe className="h-4 w-4" />
              ) : (
                <GlobeLock className="h-4 w-4" />
              )}
            </Button>
            {pubUrl && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleEndWebGracefully}
              >
                End Web
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
