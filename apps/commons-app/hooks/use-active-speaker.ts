"use client";

import { useEffect, useState, useRef } from "react";

interface Participant {
  id: string;
  audioLevel?: number;
  isSpeaking?: boolean;
}

interface UseActiveSpeakerOptions {
  /** List of participants with audio levels */
  participants: Participant[];
  /** Minimum time (ms) someone must be speaking to become active */
  activationDelay?: number;
  /** How long to keep someone as active after they stop speaking (ms) */
  deactivationDelay?: number;
}

/**
 * Hook to determine which participant is the active speaker.
 * Implements hysteresis to avoid rapid switching between speakers.
 */
export function useActiveSpeaker({
  participants,
  activationDelay = 300,
  deactivationDelay = 800,
}: UseActiveSpeakerOptions): string | null {
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  // Use refs to track state without triggering re-renders
  const speakingStartTimesRef = useRef<Map<string, number>>(new Map());
  const lastActiveTimeRef = useRef<number>(0);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }

    // Function to check and update active speaker
    const checkActiveSpeaker = () => {
      const now = Date.now();
      const currentlySpeaking = participants.filter(
        (p) => p.isSpeaking && (p.audioLevel || 0) > 0
      );

      // Update speaking start times
      const speakingStartTimes = speakingStartTimesRef.current;

      // Add new speakers
      currentlySpeaking.forEach((p) => {
        if (!speakingStartTimes.has(p.id)) {
          speakingStartTimes.set(p.id, now);
        }
      });

      // Remove participants who stopped speaking
      const currentSpeakerIds = new Set(currentlySpeaking.map((p) => p.id));
      Array.from(speakingStartTimes.keys()).forEach((id) => {
        if (!currentSpeakerIds.has(id)) {
          speakingStartTimes.delete(id);
        }
      });

      // Determine active speaker
      setActiveSpeakerId((currentActive) => {
        if (currentlySpeaking.length === 0) {
          // No one speaking - deactivate after delay
          if (currentActive && now - lastActiveTimeRef.current > deactivationDelay) {
            return null;
          }
          return currentActive;
        }

        // Find the loudest speaker who has been speaking long enough
        const candidates = currentlySpeaking
          .filter((p) => {
            const startTime = speakingStartTimes.get(p.id);
            return startTime && now - startTime >= activationDelay;
          })
          .sort((a, b) => (b.audioLevel || 0) - (a.audioLevel || 0));

        if (candidates.length > 0) {
          const newActive = candidates[0].id;
          if (newActive !== currentActive) {
            lastActiveTimeRef.current = now;
            return newActive;
          }
          // Update last active time while current speaker continues
          lastActiveTimeRef.current = now;
          return currentActive;
        }

        // People are speaking but haven't met the activation delay yet
        // Keep current active speaker if within deactivation delay
        if (currentActive && now - lastActiveTimeRef.current > deactivationDelay) {
          return null;
        }
        return currentActive;
      });
    };

    // Check immediately
    checkActiveSpeaker();

    // Then check periodically (every 100ms)
    checkIntervalRef.current = setInterval(checkActiveSpeaker, 100);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [participants, activationDelay, deactivationDelay]);

  return activeSpeakerId;
}