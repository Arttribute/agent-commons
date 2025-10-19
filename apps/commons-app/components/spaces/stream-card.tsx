"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  MicOff,
  CameraOff,
  Monitor,
  Volume2,
  VolumeX,
  Globe,
} from "lucide-react";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { AudioVisualizer } from "./audio-visualizer";

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
    webFrameUrl?: string;
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
  isActiveSpeaker?: boolean;
  activeSpeakerId?: string | null;
}

export function StreamCard({
  peer,
  isLocal = false,
  isFocused = false,
  isMinimized = false,
  onFocus,
  onMute,
  isMuted = false,
  className = "",
  isActiveSpeaker = false,
  activeSpeakerId = null,
}: StreamCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Track audio levels for visualization
  const { audioLevel, isSpeaking: isLocalSpeaking } = useAudioLevel({
    stream: peer.audioStream || peer.stream,
    audioElement: audioRef.current,
    speakingThreshold: 0.02,
  });

  // Determine if this participant is listening
  const isListening =
    !isActiveSpeaker && activeSpeakerId !== null && activeSpeakerId !== peer.id;

  // Handle video stream updates with proper cleanup
  useEffect(() => {
    if (!videoRef.current) return;

    const videoEl = videoRef.current;

    // Check if we should display video
    if (peer.stream && peer.publish.video) {
      const hasActiveVideo = peer.stream
        .getVideoTracks()
        .some((t) => t.readyState === "live" && t.enabled);

      if (hasActiveVideo) {
        videoEl.srcObject = peer.stream;
      } else {
        // No active video tracks, clear the video element
        videoEl.srcObject = null;
        videoEl.load(); // Force reload to clear any cached frames
      }
    } else {
      // Not publishing video or no stream, clear the video element
      videoEl.srcObject = null;
      videoEl.load(); // Force reload to clear any cached frames
    }

    // Cleanup function
    return () => {
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
        videoEl.load();
      }
    };
  }, [peer.stream, peer.publish?.video]);

  // Handle audio stream
  useEffect(() => {
    if (audioRef.current && peer.audioStream) {
      audioRef.current.srcObject = peer.audioStream as any;
    }
  }, [peer.audioStream]);

  // Handle audio source fallback
  useEffect(() => {
    if (!audioRef.current || peer.audioStream) return;

    if (peer.audioSrc) {
      const el = audioRef.current;
      try {
        el.pause();
        el.src = "";
      } catch {}

      setTimeout(() => {
        try {
          el.src = peer.audioSrc as string;
          const handleEnded = () => {
            try {
              el.onended = null;
              el.pause();
              el.src = "";
            } catch {}
          };
          el.onended = handleEnded;
          el.load();
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

  const getAgentColor = (id: string): string => {
    const colors = [
      "#8B5CF6", // purple-500
      "#10B981", // green-500
      "#F97316", // orange-500
      "#EC4899", // pink-500
      "#6366F1", // indigo-500
      "#14B8A6", // teal-500
    ];
    const hash = id.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Determine if we should show video
  const hasVideo = peer.stream &&
    peer.stream.getVideoTracks().length > 0 &&
    peer.stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled) &&
    peer.publish.video;

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 ${
        // Only apply aspect-video for minimized cards; focused/expanded cards should fill container
        isMinimized ? "aspect-video" : ""
      } ${
        isActiveSpeaker
          ? "ring-4 ring-blue-400 shadow-2xl shadow-blue-400/30"
          : isFocused
            ? "ring-2 ring-blue-500"
            : ""
      } ${onFocus ? "cursor-pointer" : ""} ${className} transition-all duration-300 ${isMinimized ? "hover:scale-[1.02]" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onFocus}
    >
      {/* Content layer */}
      {peer.isUrlShare && (peer.webFrameUrl || peer.frameUrl) ? (
        <img
          src={peer.webFrameUrl || (peer.frameUrl as string)}
          alt={peer.url || "web"}
          className="w-full h-full object-contain bg-gray-900"
          draggable={false}
        />
      ) : hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : peer.frameUrl && peer.publish.video ? (
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
          {peer.role === "agent" && !peer.isScreenShare && !peer.isUrlShare ? (
            <AudioVisualizer
              audioLevel={audioLevel}
              isSpeaking={isLocalSpeaking || (peer.publish?.audio && audioLevel > 0.02)}
              isListening={isListening}
              size={isMinimized ? 48 : isFocused ? 160 : 120}
              baseColor={getAgentColor(peer.id)}
            />
          ) : (
            <div
              className="text-white font-bold"
              style={{ fontSize: isMinimized ? "16px" : isFocused ? "48px" : "32px" }}
            >
              {peer.role === "agent" ? "A" : "H"}
            </div>
          )}
        </div>
      )}

      {/* Ending overlay for graceful shutdown */}
      {peer.isUrlShare && peer.ending && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-pulse">
          <span className="text-white text-sm font-medium">
            Ending web share…
          </span>
        </div>
      )}

      {/* Hidden audio element */}
      {(peer.audioStream || peer.audioSrc) && (
        <audio
          ref={audioRef}
          autoPlay
          muted={isLocal || isMuted}
          key={peer.audioSrc ? peer.audioSrc.slice(-16) : "nosrc"}
          className="hidden"
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none">
        {/* Bottom info bar */}
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {!isMinimized && (
              <>
                <Badge
                  variant={peer.role === "agent" ? "default" : "secondary"}
                  className="text-xs font-medium shadow-lg"
                >
                  {peer.role}
                </Badge>
                {peer.isScreenShare && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-blue-500/90 text-white border-blue-400 shadow-lg backdrop-blur-sm"
                  >
                    <Monitor className="h-3 w-3 mr-1" />
                    Screen
                  </Badge>
                )}
                {peer.isUrlShare && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-green-500/90 text-white border-green-400 shadow-lg backdrop-blur-sm"
                  >
                    <Globe className="h-3 w-3 mr-1" />
                    Web
                  </Badge>
                )}
                <span className="text-white text-xs font-medium drop-shadow-lg">
                  {isLocal ? "You" : `${peer.role}-${peer.id.slice(0, 4)}`}
                </span>
              </>
            )}
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {!peer.isScreenShare && !peer.isUrlShare && (
              <>
                {peer.publish.audio ? (
                  <div className="bg-green-500/20 backdrop-blur-sm rounded-full p-1.5">
                    <Mic
                      className={`text-green-400 ${isMinimized ? "h-3 w-3" : "h-4 w-4"}`}
                    />
                  </div>
                ) : (
                  <div className="bg-red-500/20 backdrop-blur-sm rounded-full p-1.5">
                    <MicOff
                      className={`text-red-400 ${isMinimized ? "h-3 w-3" : "h-4 w-4"}`}
                    />
                  </div>
                )}
                {!peer.publish.video && (
                  <div className="bg-red-500/20 backdrop-blur-sm rounded-full p-1.5">
                    <CameraOff
                      className={`text-red-400 ${isMinimized ? "h-3 w-3" : "h-4 w-4"}`}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* URL info */}
        {peer.isUrlShare && peer.url && !isMinimized && (
          <div className="absolute top-3 left-3 right-3">
            <div className="bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10">
              <span className="text-white text-xs font-medium">
                {peer.url.length > 40 ? `${peer.url.slice(0, 40)}...` : peer.url}
              </span>
            </div>
          </div>
        )}

        {/* Hover controls */}
        {isHovered && !isLocal && !isMinimized && onMute && (
          <div className="absolute top-3 right-3 pointer-events-auto">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/10"
              onClick={(e) => {
                e.stopPropagation();
                onMute();
              }}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
