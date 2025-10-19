"use client";

import { useEffect, useState, useRef } from "react";
import { useAudioLevel } from "./use-audio-level";

interface UseLocalAudioLevelOptions {
  /** Local MediaStream (from microphone) */
  localStream: React.RefObject<MediaStream | null>;
  /** Whether local audio is published */
  isPublishingAudio: boolean;
}

/**
 * Hook to track the local user's audio level for active speaker detection
 */
export function useLocalAudioLevel({
  localStream,
  isPublishingAudio,
}: UseLocalAudioLevelOptions) {
  const [currentStream, setCurrentStream] = useState<MediaStream | null>(null);

  // Update current stream when localStream changes
  useEffect(() => {
    if (isPublishingAudio && localStream.current) {
      setCurrentStream(localStream.current);
    } else {
      setCurrentStream(null);
    }
  }, [localStream, isPublishingAudio]);

  // Use the audio level hook
  const { audioLevel, isSpeaking } = useAudioLevel({
    stream: currentStream,
    speakingThreshold: 0.02,
    updateInterval: 50,
  });

  return {
    audioLevel,
    isSpeaking,
  };
}
