"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceRecorderState = "idle" | "recording" | "transcribing";

interface UseVoiceRecorderOptions {
  /** Receives the final transcription text after the user accepts a recording. */
  onTranscribed: (text: string) => void;
  onError?: (message: string) => void;
}

/**
 * Microphone recording for chat voice input.
 *
 * start() → "recording" (waveform level available via getLevel), then either
 * cancel() (discard) or accept() → "transcribing" → onTranscribed(text) →
 * back to "idle". All media resources are released on stop and on unmount.
 */
export function useVoiceRecorder({ onTranscribed, onError }: UseVoiceRecorderOptions) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const callbacksRef = useRef({ onTranscribed, onError });
  useEffect(() => {
    callbacksRef.current = { onTranscribed, onError };
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const acceptedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const releaseMedia = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => releaseMedia, [releaseMedia]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      callbacksRef.current.onError?.("Voice recording is not supported in this browser");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      callbacksRef.current.onError?.(
        "Microphone access was denied. Allow it in your browser settings to dictate messages."
      );
      return;
    }

    const mimeType = pickSupportedMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      callbacksRef.current.onError?.("Could not start the recorder on this device");
      return;
    }

    // Live level meter for the waveform.
    try {
      const AudioCtx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioCtx();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    } catch {
      // Waveform is decorative — recording still works without it.
    }

    chunksRef.current = [];
    acceptedRef.current = false;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      const accepted = acceptedRef.current;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      releaseMedia();

      if (!accepted || blob.size < 1024) {
        if (accepted) callbacksRef.current.onError?.("The recording was too short");
        setState("idle");
        return;
      }

      setState("transcribing");
      try {
        const text = await requestTranscription(blob, type);
        if (text) callbacksRef.current.onTranscribed(text);
        else callbacksRef.current.onError?.("No speech was detected in the recording");
      } catch (error) {
        callbacksRef.current.onError?.(
          error instanceof Error ? error.message : "Transcription failed"
        );
      } finally {
        setState("idle");
      }
    };

    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.start(250);

    const startedAt = Date.now();
    setElapsedMs(0);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    setState("recording");
  }, [releaseMedia]);

  const stopRecorder = useCallback((accepted: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    acceptedRef.current = accepted;
    recorder.stop();
  }, []);

  const cancel = useCallback(() => stopRecorder(false), [stopRecorder]);
  const accept = useCallback(() => stopRecorder(true), [stopRecorder]);

  /** Instant input loudness, 0..1 — polled by the waveform canvas. */
  const getLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = (data[i] - 128) / 128;
      sumSquares += value * value;
    }
    return Math.sqrt(sumSquares / data.length);
  }, []);

  return { state, elapsedMs, start, cancel, accept, getLevel };
}

async function requestTranscription(blob: Blob, mimeType: string): Promise<string> {
  const extension = mimeType.includes("mp4")
    ? "mp4"
    : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("wav")
        ? "wav"
        : "webm";
  const formData = new FormData();
  formData.set("file", blob, `recording.${extension}`);

  const response = await fetch("/api/audio/transcribe", { method: "POST", body: formData });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? "Transcription failed");
  }
  return String(payload?.data?.text ?? "").trim();
}

function pickSupportedMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}
