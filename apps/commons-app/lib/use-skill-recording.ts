"use client";

import { useEffect, useRef, useState } from "react";
import { captureSkillRecording, type CapturedRecording } from "./skill-recording";

export function useSkillRecording(context: string, onError: (error: Error) => void, onLimit: () => void) {
  const [capturedRecording, setCapturedRecording] = useState<CapturedRecording | null>(null);
  const [recording, setRecording] = useState(false);
  const [startingRecording, setStartingRecording] = useState(false);
  const captureRef = useRef<{ stop(): void; cancel(): void } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const callbacks = useRef({ onError, onLimit });
  callbacks.current = { onError, onLimit };

  useEffect(() => {
    generationRef.current += 1;
    setCapturedRecording(null);
    setRecording(false);
    setStartingRecording(false);
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
      captureRef.current?.cancel();
    };
  }, [context]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      callbacks.current.onError(new Error("Screen recording is unavailable. Use a current Chrome, Edge, or Safari browser."));
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStartingRecording(true);
    setCapturedRecording(null);
    try {
      captureRef.current = await captureSkillRecording({
        signal: controller.signal,
        onStarted: () => { setRecording(true); setStartingRecording(false); },
        onComplete: (capture) => {
          setCapturedRecording(capture);
          setRecording(false);
          if (capture.limitReached) callbacks.current.onLimit();
        },
        onError: (error) => { setRecording(false); callbacks.current.onError(error); },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setStartingRecording(false);
      if (!["NotAllowedError", "AbortError"].includes((error as DOMException)?.name)) callbacks.current.onError(error instanceof Error ? error : new Error("Could not start recording."));
    }
  };
  const captureContext = () => {
    const generation = generationRef.current;
    return () => { if (generation !== generationRef.current) throw new Error("The recording context changed. Please try again in the current account and mode."); };
  };
  return { capturedRecording, setCapturedRecording, recording, startingRecording, startRecording,
    stopRecording: () => captureRef.current?.stop(), captureContext };
}
