// apps/commons-app/hooks/use-space-rtc.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface RemotePeer {
  id: string;
  role: "human" | "agent";
  publishing: { audio: boolean; video: boolean };
  stream?: MediaStream | null;
  audioStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  // For server-side web capture we just keep last frame as data URL
  webFrameUrl?: string; // last received frame
  urlSharing?: {
    active: boolean;
    url?: string;
    ending?: boolean;
    endsAt?: number;
  };
  lastUpdate: number;
  isSpeaking?: boolean;
  audioLevel?: number;
}

export interface UseSpaceRTCOptions {
  spaceId: string;
  selfId: string;
  role: "human" | "agent";
  wsBase: string; // base http(s) URL of nest server
  autoConnect?: boolean;
  frameIntervalMs?: number; // how often to send video frames
  audioAnalysisIntervalMs?: number; // how often to compute audio chunk RMS
  maxVideoWidth?: number; // downscale frames before sending
}

interface AudioWorkState {
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
}

export function useSpaceRTC(options: UseSpaceRTCOptions) {
  const {
    spaceId,
    selfId,
    role,
    wsBase,
    autoConnect = true,
    frameIntervalMs = 700,
    audioAnalysisIntervalMs = 400,
    maxVideoWidth = 640,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef(false);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  // Local URL share is now server-driven via puppeteer capture; we keep just current URL
  const localWebUrlRef = useRef<string | null>(null);
  const audioWorkRef = useRef<AudioWorkState | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const utteranceChunksRef = useRef<Blob[]>([]);
  const utteranceModeRef = useRef<boolean>(true); // prefer full-utterance path
  const frameTimerRef = useRef<number | null>(null);
  const audioTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [compositeFrameUrl, setCompositeFrameUrl] = useState<
    string | undefined
  >();
  const [speakingMap, setSpeakingMap] = useState<
    Record<string, { level: number; speaking: boolean }>
  >({});
  const [pubState, setPubState] = useState({
    audio: false,
    video: false,
    screen: false,
    url: false,
  });

  /* ─────────────────────────  SOCKET SETUP  ───────────────────────── */
  useEffect(() => {
    if (!autoConnect || !spaceId || !selfId) return;
    const url = wsBase.endsWith("/") ? wsBase.slice(0, -1) : wsBase;
    const socket = io(`${url}/space-rtc`, {
      transports: ["websocket"],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_space", {
        spaceId,
        participantId: selfId,
        participantType: role,
      });
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setJoined(false);
      joinedRef.current = false;
    });

    socket.on("participant_joined", (evt: any) => {
      setJoined(true);
      joinedRef.current = true;
      addOrUpdatePeer(evt.participantId, {
        role: (evt.participantType as any) || "human",
      });
    });
    socket.on("participant_left", (evt: any) => {
      setRemotePeers((prev) => prev.filter((p) => p.id !== evt.participantId));
    });
    socket.on("composite_frame", (evt: any) => {
      if (evt?.dataUrl) setCompositeFrameUrl(evt.dataUrl);
    });
    socket.on("audio_state", (evt: any) => {
      if (!evt?.participants) return;
      const map: Record<string, { level: number; speaking: boolean }> = {};
      evt.participants.forEach((p: any) => {
        map[p.participantId] = { level: p.audioLevel, speaking: p.isSpeaking };
      });
      setSpeakingMap(map);
      setRemotePeers((prev) =>
        prev.map((rp) =>
          map[rp.id]
            ? {
                ...rp,
                isSpeaking: map[rp.id].speaking,
                audioLevel: map[rp.id].level,
              }
            : rp
        )
      );
    });

    // Web capture lifecycle
    socket.on("web_capture_started", (evt: any) => {
      if (!evt?.participantId) return;
      addOrUpdatePeer(evt.participantId, {
        urlSharing: { active: true, url: evt.url },
      });
    });
    socket.on("web_capture_ending", (evt: any) => {
      if (!evt?.participantId) return;
      const eta = Date.now() + (evt.in || 0);
      addOrUpdatePeer(evt.participantId, {
        urlSharing: { active: true, url: evt.url, ending: true, endsAt: eta },
      });
    });
    socket.on("web_capture_stopped", (evt: any) => {
      if (!evt?.participantId) return;
      addOrUpdatePeer(evt.participantId, {
        urlSharing: { active: false },
        webFrameUrl: undefined,
      });
    });
    socket.on("web_capture_frame", (evt: any) => {
      if (!evt?.participantId || !evt?.frame) return;
      addOrUpdatePeer(evt.participantId, {
        webFrameUrl: evt.frame,
        urlSharing: { active: true },
      });
    });

    return () => {
      try {
        if (joinedRef.current) socket.emit("leave_space", { spaceId });
        socket.disconnect();
      } catch {}
      stopAllPublishing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, selfId, role, wsBase, autoConnect]);

  /* ─────────────────────────  PEER MGMT  ───────────────────────── */
  const addOrUpdatePeer = useCallback(
    (id: string, patch: Partial<RemotePeer>) => {
      setRemotePeers((prev) => {
        const existing = prev.find((p) => p.id === id);
        if (existing) {
          return prev.map((p) =>
            p.id === id ? { ...p, ...patch, lastUpdate: Date.now() } : p
          );
        }
        return [
          ...prev,
          {
            id,
            role: (patch.role as any) || "human",
            publishing: patch.publishing || { audio: false, video: false },
            stream: patch.stream ?? null,
            audioStream: patch.audioStream ?? null,
            screenStream: patch.screenStream ?? null,
            webFrameUrl: patch.webFrameUrl,
            urlSharing: patch.urlSharing ?? { active: false },
            lastUpdate: Date.now(),
            isSpeaking: patch.isSpeaking,
            audioLevel: patch.audioLevel,
          },
        ];
      });
    },
    []
  );

  /* ─────────────────────────  LOCAL MEDIA  ───────────────────────── */
  const getCanvas = () => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    return canvasRef.current;
  };

  const startCamera = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const ms = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    localStreamRef.current = ms;
    videoTrackRef.current = ms.getVideoTracks()[0] || null;
    return ms;
  }, []);

  const startMicrophone = useCallback(async () => {
    if (audioTrackRef.current) return audioTrackRef.current;
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    audioTrackRef.current = ms.getAudioTracks()[0] || null;
    // merge audio into localStreamRef for rendering if video present
    if (localStreamRef.current) {
      ms.getAudioTracks().forEach((t) => localStreamRef.current!.addTrack(t));
    } else {
      localStreamRef.current = ms;
    }
    setupAudioProcessing(ms);
    // Start full-utterance recording if enabled
    try {
      if (utteranceModeRef.current) {
        const rec = new MediaRecorder(ms, {
          mimeType: "audio/webm;codecs=opus",
        });
        utteranceChunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0)
            utteranceChunksRef.current.push(e.data);
        };
        rec.onstop = async () => {
          try {
            const blob = new Blob(utteranceChunksRef.current, {
              type: rec.mimeType,
            });
            const base64 = await blobToBase64(blob);
            const socket = socketRef.current;
            if (socket && joinedRef.current) {
              socket.emit("audio_utterance", {
                audio: base64,
                mime: rec.mimeType,
                fileName: "utterance.webm",
              });
            }
          } catch {}
        };
        rec.start();
        recorderRef.current = rec;
      }
    } catch {}
    return audioTrackRef.current;
  }, []);

  const stopCamera = () => {
    if (videoTrackRef.current) {
      videoTrackRef.current.stop();
      videoTrackRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
      localStreamRef.current = new MediaStream(
        localStreamRef.current.getAudioTracks()
      );
    }
  };
  const stopMicrophone = () => {
    // Stop full-utterance recorder first to finalize and send
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== "inactive")
          recorderRef.current.stop();
      } catch {}
      recorderRef.current = null;
    }
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => t.stop());
      localStreamRef.current = new MediaStream(
        localStreamRef.current.getVideoTracks()
      );
    }
    teardownAudioProcessing();
  };

  const startScreen = useCallback(async () => {
    if (screenStreamRef.current) return screenStreamRef.current;
    const ms = await (navigator.mediaDevices as any).getDisplayMedia({
      video: true,
      audio: false,
    });
    screenStreamRef.current = ms;
    ms.getVideoTracks()[0]?.addEventListener("ended", () => {
      setPubState((s) => ({ ...s, screen: false }));
      screenStreamRef.current = null;
    });
    return ms;
  }, []);

  const stopScreen = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
  };

  // Initiate / stop server web capture via socket events
  const startUrlShare = async (url: string) => {
    if (!socketRef.current || !joinedRef.current) return;
    localWebUrlRef.current = url;
    socketRef.current.emit("start_web_capture", { url });
  };
  const stopUrlShare = () => {
    if (!socketRef.current || !joinedRef.current) return;
    socketRef.current.emit("stop_web_capture", {});
    localWebUrlRef.current = null;
  };
  const endUrlShareGracefully = (delayMs = 1500) => {
    if (!socketRef.current || !joinedRef.current) return;
    socketRef.current.emit("end_web_capture", { delayMs });
  };

  /* ─────────────────────────  AUDIO PROCESSING  ───────────────────────── */
  const setupAudioProcessing = (ms: MediaStream) => {
    if (audioWorkRef.current) return;
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(ms);
      const processor = context.createScriptProcessor(2048, 1, 1);
      source.connect(processor);
      processor.connect(context.destination);
      processor.onaudioprocess = (e) => {
        // basic RMS -> speaking detection done server-side. Here we can optionally update a local UI.
        // We'll periodically send audio chunks (raw PCM16) below in timer.
      };
      audioWorkRef.current = { context, processor, source };
    } catch (e) {
      // ignore
    }
  };
  const teardownAudioProcessing = () => {
    if (audioWorkRef.current) {
      audioWorkRef.current.processor.disconnect();
      audioWorkRef.current.source.disconnect();
      audioWorkRef.current.context.close();
      audioWorkRef.current = null;
    }
  };

  /* ─────────────────────────  ENCODING HELPERS  ───────────────────────── */
  const captureAndSendVideoFrame = useCallback(
    (kind: "camera" | "screen") => {
      const socket = socketRef.current;
      if (!socket || !joinedRef.current) return;
      let mediaStream: MediaStream | null = null;
      if (kind === "camera" && localStreamRef.current)
        mediaStream = localStreamRef.current;
      if (kind === "screen" && screenStreamRef.current)
        mediaStream = screenStreamRef.current;
      if (!mediaStream) return;

      const videoEl = document.createElement("video");
      videoEl.muted = true;
      videoEl.srcObject = mediaStream;
      videoEl.play().catch(() => {});
      // allow frame to be ready
      setTimeout(() => {
        try {
          const trackSettings = mediaStream!.getVideoTracks()[0]?.getSettings();
          const w = trackSettings?.width || 640;
          const h = trackSettings?.height || 360;
          const canvas = getCanvas();
          const scale = Math.min(1, maxVideoWidth / w);
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
          socket.emit("video_frame", { kind, frame: dataUrl });
        } catch {}
      }, 50);
    },
    [maxVideoWidth]
  );

  const sendAudioChunk = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !joinedRef.current) return;
    if (!audioTrackRef.current) return;
    if (utteranceModeRef.current) return; // in utterance mode, skip small chunks

    // Capture small chunk by using a MediaRecorder over a short period
    const ms = new MediaStream([audioTrackRef.current]);
    try {
      const rec = new MediaRecorder(ms, { mimeType: "audio/webm;codecs=opus" });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        blob.arrayBuffer().then((ab) => {
          const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
          socket.emit("audio_chunk", { audio: b64 });
        });
      };
      rec.start();
      setTimeout(() => rec.stop(), 150); // ~150ms chunk
    } catch (e) {
      // ignore
    }
  }, []);

  /* ─────────────────────────  TIMERS  ───────────────────────── */
  useEffect(() => {
    if (!joined || (!pubState.video && !pubState.screen)) {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
    } else if (!frameTimerRef.current) {
      frameTimerRef.current = window.setInterval(() => {
        if (pubState.video) captureAndSendVideoFrame("camera");
        if (pubState.screen) captureAndSendVideoFrame("screen");
      }, frameIntervalMs);
    }
    return () => {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
    };
  }, [
    joined,
    pubState.video,
    pubState.screen,
    pubState.url,
    captureAndSendVideoFrame,
    frameIntervalMs,
  ]);

  useEffect(() => {
    if (!joined || !pubState.audio) {
      if (audioTimerRef.current) {
        clearInterval(audioTimerRef.current);
        audioTimerRef.current = null;
      }
    } else if (!audioTimerRef.current) {
      if (utteranceModeRef.current) return; // do not set interval in utterance mode
      audioTimerRef.current = window.setInterval(() => {
        sendAudioChunk();
      }, audioAnalysisIntervalMs);
    }
    return () => {
      if (audioTimerRef.current) {
        clearInterval(audioTimerRef.current);
        audioTimerRef.current = null;
      }
    };
  }, [joined, pubState.audio, sendAudioChunk, audioAnalysisIntervalMs]);

  // Helper: convert Blob to base64 without data URL prefix
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const dataUrl = reader.result as string;
          const idx = dataUrl.indexOf(",");
          resolve(idx !== -1 ? dataUrl.substring(idx + 1) : dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /* ─────────────────────────  PUBLISH TOGGLES  ───────────────────────── */
  const togglePublish = useCallback(
    async (
      kind: "audio" | "video" | "screen" | "url",
      urlForShare?: string
    ) => {
      if (!socketRef.current) return;
      if (!joinedRef.current) return;
      if (kind === "audio") {
        if (pubState.audio) {
          stopMicrophone();
          setPubState((s) => ({ ...s, audio: false }));
        } else {
          await startMicrophone();
          setPubState((s) => ({ ...s, audio: true }));
        }
      } else if (kind === "video") {
        if (pubState.video) {
          stopCamera();
          setPubState((s) => ({ ...s, video: false }));
        } else {
          await startCamera();
          setPubState((s) => ({ ...s, video: true }));
        }
      } else if (kind === "screen") {
        if (pubState.screen) {
          stopScreen();
          setPubState((s) => ({ ...s, screen: false }));
        } else {
          await startScreen();
          setPubState((s) => ({ ...s, screen: true }));
        }
      } else if (kind === "url") {
        if (pubState.url) {
          stopUrlShare();
          setPubState((s) => ({ ...s, url: false }));
        } else if (urlForShare) {
          await startUrlShare(urlForShare);
          setPubState((s) => ({ ...s, url: true }));
        }
      }
    },
    [pubState, startCamera, startMicrophone, startScreen]
  );

  const stopAllPublishing = () => {
    stopCamera();
    stopMicrophone();
    stopScreen();
    stopUrlShare();
    setPubState({ audio: false, video: false, screen: false, url: false });
  };

  /* ─────────────────────────  RETURN API  ───────────────────────── */
  return {
    // connection
    socket: socketRef.current,
    connected,
    joined,
    // local media
    localStream: localStreamRef,
    localScreenStream: screenStreamRef,
    localWebUrl: localWebUrlRef.current,
    pubState,
    togglePublish,
    stopAllPublishing,
    endWebCapture: endUrlShareGracefully,
    // remote
    remotePeers,
    speakingMap,
    compositeFrameUrl,
  };
}
