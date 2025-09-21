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
} from "lucide-react";
import { useSpaceRTC } from "@/hooks/use-space-rtc";

interface StreamCardProps {
  peer: {
    id: string;
    role: "human" | "agent";
    stream?: MediaStream;
    audioStream?: MediaStream;
    publish: { audio: boolean; video: boolean };
    isScreenShare?: boolean;
    isUrlShare?: boolean;
    url?: string;
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
      {peer.stream &&
      (peer.publish.video || peer.isScreenShare || peer.isUrlShare) ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="w-full h-full object-cover"
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

      {/* Hidden audio element to play separate audio-only streams */}
      {peer.audioStream && (
        <audio
          ref={audioRef}
          autoPlay
          muted={isLocal || isMuted}
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
  isExpanded = false,
  onToggleExpanded,
}: {
  spaceId: string;
  selfId: string;
  role: "human" | "agent";
  wsUrl: string;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const {
    joined,
    remotePeers,
    localStream,
    localScreenStream,
    localUrlStream,
    startPublishing,
    stopPublishing,
    startScreenShare,
    stopScreenShare,
    startUrlShare,
    stopUrlShare,
  } = useSpaceRTC({
    spaceId,
    selfId,
    role,
    wsUrl,
  });

  const [pubAudio, setPubAudio] = useState<boolean>(false);
  const [pubVideo, setPubVideo] = useState<boolean>(false);
  const [pubScreen, setPubScreen] = useState<boolean>(false);
  const [pubUrl, setPubUrl] = useState<boolean>(false);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [urlInputValue, setUrlInputValue] = useState<string>("");
  const [focusedPeer, setFocusedPeer] = useState<string | null>(null);
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set());

  async function togglePublish(kind: "audio" | "video" | "screen" | "url") {
    if (kind === "screen") {
      if (!pubScreen) {
        try {
          await startScreenShare();
          setPubScreen(true);
        } catch (err) {
          console.error("Screen sharing failed:", err);
        }
      } else {
        stopScreenShare();
        setPubScreen(false);
      }
      return;
    }

    if (kind === "url") {
      if (!pubUrl) {
        setShowUrlInput(true);
      } else {
        stopUrlShare();
        setPubUrl(false);
        setCurrentUrl("");
      }
      return;
    }

    if (!pubAudio && !pubVideo) {
      const next = {
        audio: kind === "audio" ? true : pubAudio,
        video: kind === "video" ? true : pubVideo,
      };
      await startPublishing(next);
      setPubAudio(next.audio);
      setPubVideo(next.video);
      return;
    }

    const next = {
      audio: kind === "audio" ? !pubAudio : pubAudio,
      video: kind === "video" ? !pubVideo : pubVideo,
    };
    stopPublishing();
    if (next.audio || next.video) {
      await startPublishing(next);
    }
    setPubAudio(next.audio);
    setPubVideo(next.video);
  }

  const handleUrlSubmit = async () => {
    if (!urlInputValue.trim()) return;

    let url = urlInputValue.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    try {
      await startUrlShare(url);
      setPubUrl(true);
      setCurrentUrl(url);
      setShowUrlInput(false);
      setUrlInputValue("");
    } catch (err) {
      console.error("URL sharing failed:", err);
    }
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
    stream?: MediaStream | null;
    audioStream?: MediaStream | null;
    publish: { audio: boolean; video: boolean };
    isLocal: boolean;
    isScreenShare: boolean;
    isUrlShare: boolean;
    url?: string;
  };

  const allStreams: StreamItem[] = [];

  // Add local camera/mic stream
  if ((pubAudio || pubVideo) && localStream.current) {
    allStreams.push({
      id: selfId,
      role,
      stream: localStream.current,
      audioStream: undefined,
      publish: { audio: pubAudio, video: pubVideo },
      isLocal: true,
      isScreenShare: false,
      isUrlShare: false,
    });
  }

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
  if (pubUrl && localUrlStream.current) {
    allStreams.push({
      id: `${selfId}-url`,
      role,
      stream: localUrlStream.current,
      audioStream: undefined,
      publish: { audio: false, video: true },
      isLocal: true,
      isScreenShare: false,
      isUrlShare: true,
      url: currentUrl,
    });
  }

  // Add remote streams
  remotePeers.forEach((peer) => {
    // Add regular stream
    if (peer.stream || peer.audioStream || peer.publishing.audio) {
      allStreams.push({
        id: peer.id,
        role: peer.role,
        stream: peer.stream,
        audioStream: peer.audioStream || null,
        publish: peer.publishing,
        isLocal: false,
        isScreenShare: false,
        isUrlShare: false,
      });
    }

    // Add screen share stream
    if (peer.screenStream) {
      allStreams.push({
        id: `${peer.id}-screen`,
        role: peer.role,
        stream: peer.screenStream,
        audioStream: undefined,
        publish: { audio: false, video: true },
        isLocal: false,
        isScreenShare: true,
        isUrlShare: false,
      });
    }

    // Add URL share stream
    if (peer.urlStream) {
      allStreams.push({
        id: `${peer.id}-url`,
        role: peer.role,
        stream: peer.urlStream,
        audioStream: undefined,
        publish: { audio: false, video: true },
        isLocal: false,
        isScreenShare: false,
        isUrlShare: true,
        url: peer.urlSharing.url,
      });
    }
  });

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
                      publish: focusedStream.publish,
                      isScreenShare: focusedStream.isScreenShare,
                      isUrlShare: focusedStream.isUrlShare,
                      url: focusedStream.url,
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
                            publish: stream.publish,
                            isScreenShare: stream.isScreenShare,
                            isUrlShare: stream.isUrlShare,
                            url: stream.url,
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
            <div
              className={`p-3 grid gap-3`}
              style={{
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
              }}
            >
              {allStreams.map((stream) => (
                <StreamCard
                  key={stream.id}
                  peer={{
                    id: stream.id,
                    role: stream.role,
                    stream: stream.stream || undefined,
                    audioStream: stream.audioStream || undefined,
                    publish: stream.publish,
                    isScreenShare: stream.isScreenShare,
                    isUrlShare: stream.isUrlShare,
                    url: stream.url,
                  }}
                  isLocal={stream.isLocal}
                  onFocus={() => handleStreamFocus(stream.id)}
                  onMute={
                    stream.isLocal ? undefined : () => toggleMutePeer(stream.id)
                  }
                  isMuted={mutedPeers.has(stream.id)}
                />
              ))}
            </div>
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
          </div>
        )}
      </div>
    </div>
  );
}
