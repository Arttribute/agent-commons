"use client";

import { useEffect, useRef, useState } from "react";

interface UseAudioLevelOptions {
  /** MediaStream to analyze */
  stream?: MediaStream | null;
  /** Audio element to analyze (for TTS playback) */
  audioElement?: HTMLAudioElement | null;
  /** How often to update the audio level (ms) */
  updateInterval?: number;
  /** Threshold to consider as "speaking" (0-1) */
  speakingThreshold?: number;
  /** Enable smoothing for more natural visualization */
  enableSmoothing?: boolean;
}

interface UseAudioLevelResult {
  /** Current audio level (0-1) */
  audioLevel: number;
  /** Whether audio is above speaking threshold */
  isSpeaking: boolean;
  /** Peak audio level in the current window */
  peakLevel: number;
}

/**
 * Hook to track real-time audio levels from MediaStream or Audio element.
 * Supports both WebRTC streams and TTS audio playback.
 */
export function useAudioLevel({
  stream,
  audioElement,
  updateInterval = 50,
  speakingThreshold = 0.02,
  enableSmoothing = true,
}: UseAudioLevelOptions): UseAudioLevelResult {
  const [audioLevel, setAudioLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef(0);
  const lastSpeakingTimeRef = useRef<number>(0);
  const decayAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    // Clean up previous setup
    const cleanup = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (decayAnimationRef.current) {
        cancelAnimationFrame(decayAnimationRef.current);
        decayAnimationRef.current = null;
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {}
        sourceRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {}
        analyserRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        try {
          audioContextRef.current.close();
        } catch {}
        audioContextRef.current = null;
      }
    };

    // Only set up if we have a valid audio source
    const hasValidStream = stream && stream.getAudioTracks().length > 0;
    const hasValidAudioElement = audioElement && !audioElement.paused;

    if (!hasValidStream && !hasValidAudioElement) {
      cleanup();
      setAudioLevel(0);
      setPeakLevel(0);
      setIsSpeaking(false);
      smoothedLevelRef.current = 0;
      return;
    }

    try {
      // Create audio context and analyser
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();

      // More responsive settings
      analyser.fftSize = 512; // Smaller for faster updates
      analyser.smoothingTimeConstant = 0.3; // Less smoothing for more responsiveness

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Create appropriate source
      if (hasValidStream) {
        const source = audioContext.createMediaStreamSource(stream!);
        source.connect(analyser);
        sourceRef.current = source;
      } else if (hasValidAudioElement) {
        const source = audioContext.createMediaElementSource(audioElement!);
        source.connect(analyser);
        // Also connect to destination so audio still plays
        analyser.connect(audioContext.destination);
        sourceRef.current = source;
      }

      const dataArray = new Uint8Array(analyser.fftSize);
      let lastUpdate = Date.now();

      // Decay animation for lingering effect after silence
      const startDecayAnimation = (startLevel: number) => {
        const decayDuration = 1500; // 1.5 seconds of lingering movement
        const startTime = Date.now();
        const minLevel = speakingThreshold * 0.8; // Keep above threshold briefly

        const decay = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / decayDuration, 1);

          // Exponential decay for natural feel
          const decayFactor = Math.pow(1 - progress, 2);
          const currentLevel = Math.max(startLevel * decayFactor, minLevel * (1 - progress));

          setAudioLevel(currentLevel);
          setIsSpeaking(currentLevel > speakingThreshold * 0.5); // Keep "speaking" state longer

          if (progress < 1) {
            decayAnimationRef.current = requestAnimationFrame(decay);
          } else {
            setAudioLevel(0);
            setIsSpeaking(false);
            decayAnimationRef.current = null;
          }
        };

        decay();
      };

      // Animation loop to read audio levels
      const updateLevel = () => {
        if (!analyserRef.current) return;

        // Use time domain data for better waveform analysis
        analyser.getByteTimeDomainData(dataArray);

        // Calculate RMS (root mean square) for accurate volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128; // Convert to -1 to 1
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Update at specified interval
        const now = Date.now();
        if (now - lastUpdate >= updateInterval) {
          lastUpdate = now;

          // Apply lighter smoothing for more responsiveness
          const smoothingFactor = enableSmoothing ? 0.5 : 0.8; // Higher = more responsive
          smoothedLevelRef.current =
            smoothedLevelRef.current * (1 - smoothingFactor) + rms * smoothingFactor;

          const level = smoothedLevelRef.current;
          const isCurrentlySpeaking = level > speakingThreshold;

          // If currently speaking, cancel any decay animation
          if (isCurrentlySpeaking) {
            if (decayAnimationRef.current) {
              cancelAnimationFrame(decayAnimationRef.current);
              decayAnimationRef.current = null;
            }
            lastSpeakingTimeRef.current = now;
            setAudioLevel(level);
            setPeakLevel((prev) => Math.max(prev * 0.9, level)); // Decay peak
            setIsSpeaking(true);
          } else {
            // Check if we just stopped speaking (within last 200ms)
            const timeSinceSpeaking = now - lastSpeakingTimeRef.current;
            if (timeSinceSpeaking < 200 && timeSinceSpeaking > 0 && !decayAnimationRef.current) {
              // Start decay animation from current level
              startDecayAnimation(smoothedLevelRef.current);
            } else if (!decayAnimationRef.current) {
              // No recent speech and no decay running, just set to zero
              setAudioLevel(level);
              setPeakLevel((prev) => Math.max(prev * 0.9, level));
              setIsSpeaking(false);
            }
            // If decay animation is running, it handles the state updates
          }
        }

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (error) {
      console.error("Error setting up audio level detection:", error);
      cleanup();
    }

    return cleanup;
  }, [stream, audioElement, updateInterval, speakingThreshold, enableSmoothing]);

  return {
    audioLevel,
    isSpeaking,
    peakLevel,
  };
}
