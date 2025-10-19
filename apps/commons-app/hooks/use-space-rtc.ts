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
  audioSrc?: string | null; // fallback source for audio element when no MediaStream is available
  screenStream?: MediaStream | null;
  // For server-side web capture we just keep last frame as data URL
  webFrameUrl?: string; // last received frame
  cameraFrameUrl?: string | null; // last received camera frame (data URL)
  screenFrameUrl?: string | null; // last received screen frame (data URL)
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
  // Always use WebRTC for participant audio/video/screen (no env gating). Minimal STUN list.
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // PeerConnection management
  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );
  const remoteStreamMapRef = useRef<Map<string, MediaStream>>(new Map());
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
  // We use audioSrc on peers for TTS playback; no off-DOM audio elements needed
  // Soft queue to serialize TTS playback across agents in the space
  const ttsQueueRef = useRef<Array<{ pid: string; src: string; id: string }>>(
    []
  );
  const ttsPlayingRef = useRef<boolean>(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ensureTtsAudio = () => {
    if (!ttsAudioRef.current) {
      const a = new Audio();
      a.autoplay = false; // we'll call play()
      a.preload = "auto";
      a.onended = () => {
        ttsPlayingRef.current = false;
        drainTtsQueue();
      };
      ttsAudioRef.current = a;
    }
    return ttsAudioRef.current;
  };
  const drainTtsQueue = () => {
    if (ttsPlayingRef.current) return;
    const next = ttsQueueRef.current.shift();
    if (!next) return;
    const a = ensureTtsAudio();
    try {
      a.src = next.src;
      ttsPlayingRef.current = true;
      a.currentTime = 0;
      a.play().catch(() => {
        // Fallback: attach to peer so UI element can play
        addOrUpdatePeer(next.pid, { audioSrc: next.src });
        ttsPlayingRef.current = false;
      });
    } catch {
      ttsPlayingRef.current = false;
    }
  };

  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  // Keep a ref of remotePeers for merging publishing flags safely inside event handlers
  const remotePeersRef = useRef<RemotePeer[]>([]);
  useEffect(() => {
    remotePeersRef.current = remotePeers;
  }, [remotePeers]);
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
      // Clear remote peers to avoid stale TTS replays when reconnecting
      setRemotePeers([]);
    });

    socket.on("participant_joined", (evt: any) => {
      setJoined(true);
      joinedRef.current = true;
      addOrUpdatePeer(evt.participantId, {
        role: (evt.participantType as any) || "human",
      });
      if (evt.participantId !== selfId) ensurePeerConnection(evt.participantId);
    });
    socket.on("participants_snapshot", (evt: any) => {
      try {
        const list = (evt?.participants as any[]) || [];
        list.forEach((p) => {
          addOrUpdatePeer(p.participantId, {
            role: (p.participantType as any) || "human",
          });
          if (p.participantId !== selfId) ensurePeerConnection(p.participantId);
        });
      } catch {}
    });
    socket.on("participant_left", (evt: any) => {
      const participantId = evt.participantId;
      console.debug("[space-rtc] Participant left:", participantId);

      // Gracefully clean up streams for this participant
      const stream = remoteStreamMapRef.current.get(participantId);
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        remoteStreamMapRef.current.delete(participantId);
      }

      // Also clean up screen share stream if present
      const screenStream = remoteStreamMapRef.current.get(`${participantId}-screen`);
      if (screenStream) {
        screenStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        remoteStreamMapRef.current.delete(`${participantId}-screen`);
      }

      // Remove from peers list
      setRemotePeers((prev) => prev.filter((p) => p.id !== participantId));

      // Close peer connection
      closePeerConnection(participantId);
    });
    socket.on("composite_frame", (evt: any) => {
      if (evt?.dataUrl) setCompositeFrameUrl(evt.dataUrl);
    });
    // Per-participant video frames (camera/screen/web) so UIs can render all peers concurrently (frames mode only)
    socket.on("participant_frame", (evt: any) => {
      // Retain only for web/url capture frames (kind === 'web')
      try {
        if (!evt?.participantId || !evt?.kind || !evt?.frame) return;
        const id = evt.participantId as string;
        const kind = evt.kind as "camera" | "screen" | "web";
        const frame = evt.frame as string; // data URL
        const role = (evt.participantType as any) || "human";
        // Preserve existing publishing audio flag (mic) if we update video flag here
        const existing = remotePeersRef.current.find((p) => p.id === id);
        const basePatch: any = { role };
        if (kind === "web") {
          basePatch.webFrameUrl = frame;
          basePatch.urlSharing = { active: true };
        } else if (kind === "screen") {
          basePatch.screenFrameUrl = frame;
          basePatch.publishing = {
            audio: existing?.publishing?.audio || false,
            video: true,
          };
        } else if (kind === "camera") {
          basePatch.cameraFrameUrl = frame;
          basePatch.publishing = {
            audio: existing?.publishing?.audio || false,
            video: true,
          };
        }
        addOrUpdatePeer(id, basePatch);
      } catch {}
    });
    socket.on("audio_state", (evt: any) => {
      if (!evt?.participants) return;
      const map: Record<string, { level: number; speaking: boolean }> = {};
      evt.participants.forEach((p: any) => {
        map[p.participantId] = { level: p.audioLevel, speaking: p.isSpeaking };
        // Update speaking info; defer publishing merge to setRemotePeers so we preserve existing video flag
        addOrUpdatePeer(p.participantId, {
          role: (p.participantType as any) || "human",
          isSpeaking: p.isSpeaking,
          audioLevel: p.audioLevel,
        });
      });
      setSpeakingMap(map);
      setRemotePeers((prev) =>
        prev.map((rp) =>
          map[rp.id]
            ? {
                ...rp,
                isSpeaking: map[rp.id].speaking,
                audioLevel: map[rp.id].level,
                publishing: {
                  audio: map[rp.id].speaking,
                  video: rp.publishing?.video || false,
                },
              }
            : rp
        )
      );
    });

    // TTS audio from server for agent participants
    socket.on("tts_audio", async (evt: any) => {
      try {
        const pid: string | undefined = evt?.participantId;
        const audio: string | undefined = evt?.audio; // data URL
        const playbackId: string | undefined = evt?.playbackId;
        if (!pid || !audio) return;

        if (process.env.NEXT_PUBLIC_TTS_DEBUG === "true") {
          try {
            console.debug("[TTS] recv", {
              pid,
              size: audio.length,
              mime: evt?.mime,
              provider: evt?.provider,
              at: evt?.at,
            });
            // Optionally download the audio for inspection
            const a = document.createElement("a");
            a.href = audio;
            a.download = `tts_${pid}_${Date.now()}.audio`;
            a.style.display = "none";
            document.body.appendChild(a);
            // comment out next line to avoid auto-download; keep logs only
            // a.click();
            document.body.removeChild(a);
          } catch (e) {
            console.debug("[TTS] debug log/download error", e);
          }
        }

        // Queue for serialized playback across the room
        const id = playbackId || `${pid}:${Date.now()}`;
        const src = audio + `#t=${Date.now()}`;
        ttsQueueRef.current.push({ pid, src, id });
        // Ensure peer exists and mark as speaking; UI can also show who is about to speak
        addOrUpdatePeer(pid, {
          role: (evt.participantType as any) || "agent",
          publishing: { audio: true, video: false },
          isSpeaking: true,
          audioStream: null,
          audioSrc: null,
        });
        // Start drain if idle
        drainTtsQueue();
      } catch {}
    });

    socket.on("tts_playback_complete", (evt: any) => {
      // Optional server hint; we already chain via onended
      // Could be used to update UI instantly if needed
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

    // Signaling: WebRTC
    {
      socket.on("rtc_offer", async (evt: any) => {
        try {
          const from: string = evt?.from;
          const to: string = evt?.to;
          const description: RTCSessionDescriptionInit | undefined =
            evt?.description;
          if (!from || !to || !description) return;
          if (from === selfId) return; // ignore self
          if (to !== selfId) return; // not for us
          const pc = ensurePeerConnection(from);
          const isPolite = selfId > from; // simple lexical tie-breaker
          const makingOffer = makingOfferRef.current.get(from) || false;
          const offerCollision =
            description.type === "offer" &&
            (makingOffer || pc.signalingState !== "stable");
          if (offerCollision && !isPolite) {
            // Ignore the offer, mark so we roll back if needed
            ignoreOfferRef.current.set(from, true);
            return;
          }
          ignoreOfferRef.current.set(from, false);
          await pc.setRemoteDescription(description);
          // Apply any queued ICE candidates
          flushQueuedCandidates(from);
          if (description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("rtc_answer", {
              to: from,
              description: pc.localDescription,
            });
          }
        } catch (e) {
          // failed negotiation attempt; rollback if needed
        }
      });
      socket.on("rtc_answer", async (evt: any) => {
        try {
          const from: string = evt?.from;
          const to: string = evt?.to;
          const description: RTCSessionDescriptionInit | undefined =
            evt?.description;
          if (!from || !to || !description) return;
          if (to !== selfId) return; // not for us
          const pc = pcMapRef.current.get(from);
          if (!pc) return;
          await pc.setRemoteDescription(description);
          flushQueuedCandidates(from);
        } catch {}
      });
      socket.on("rtc_ice_candidate", async (evt: any) => {
        try {
          const from: string = evt?.from;
          const to: string = evt?.to;
          const candidate: RTCIceCandidateInit = evt?.candidate;
          if (!from || !to || !candidate) return;
          if (to !== selfId) return; // not for us
          const pc = pcMapRef.current.get(from);
          if (!pc) return; // might race with join; drop or queue
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(candidate);
            } catch {}
          } else {
            // queue until remote description applied
            const list = pendingCandidatesRef.current.get(from) || [];
            list.push(candidate);
            pendingCandidatesRef.current.set(from, list);
          }
        } catch {}
      });
    }

    return () => {
      try {
        if (joinedRef.current) socket.emit("leave_space", { spaceId });
        socket.disconnect();
      } catch {}
      stopAllPublishing();
      Array.from(pcMapRef.current.keys()).forEach(closePeerConnection);
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
            p.id === id
              ? {
                  ...p,
                  ...patch,
                  publishing: patch.publishing
                    ? patch.publishing
                    : (p.publishing ?? { audio: false, video: false }),
                  lastUpdate: Date.now(),
                }
              : p
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
            audioSrc: (patch as any)?.audioSrc,
            screenStream: patch.screenStream ?? null,
            webFrameUrl: patch.webFrameUrl,
            cameraFrameUrl: (patch as any)?.cameraFrameUrl ?? null,
            screenFrameUrl: (patch as any)?.screenFrameUrl ?? null,
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
    // Always acquire a fresh camera track to avoid ended tracks causing black video
    const ms = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    const newVideoTrack = ms.getVideoTracks()[0] || null;
    videoTrackRef.current = newVideoTrack;
    // Merge with existing audio tracks if any
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];
    const merged = new MediaStream([
      ...(newVideoTrack ? [newVideoTrack] : []),
      ...audioTracks,
    ]);
    // Stop old video tracks
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      try {
        t.stop();
      } catch {}
    });
    localStreamRef.current = merged;
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
    try {
      if (videoTrackRef.current) {
        videoTrackRef.current.stop();
        videoTrackRef.current = null;
      }
      if (localStreamRef.current) {
        // Remove video tracks, keep audio tracks if any
        localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
        const aud = localStreamRef.current.getAudioTracks();
        localStreamRef.current = new MediaStream(aud);
      }
    } catch {}
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
    // Always request a fresh screen stream; previous may be ended
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

      const track = mediaStream.getVideoTracks()[0];
      if (!track) return;

      // Prefer ImageCapture API for direct frame grabbing (more reliable, no <video> readiness race)
      if (
        typeof window !== "undefined" &&
        "ImageCapture" in window &&
        track.readyState === "live"
      ) {
        try {
          const ic: any = new (window as any).ImageCapture(track);
          if (ic && typeof ic.grabFrame === "function") {
            ic.grabFrame()
              .then((bitmap: ImageBitmap) => {
                const canvas = getCanvas();
                const w = bitmap.width || 640;
                const h = bitmap.height || 360;
                const scale = Math.min(1, maxVideoWidth / w);
                canvas.width = Math.round(w * scale);
                canvas.height = Math.round(h * scale);
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
                socket.emit("video_frame", {
                  kind,
                  frame: dataUrl,
                  width: canvas.width,
                  height: canvas.height,
                });
                bitmap.close && bitmap.close();
              })
              .catch(() => {
                // Fallback to video element path below
                fallbackElementCapture();
              });
            return; // Attempting ImageCapture path
          }
        } catch {
          // ignore and fallback
        }
      }

      const fallbackElementCapture = () => {
        const videoEl = document.createElement("video");
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.srcObject = mediaStream;
        const tryCapture = () => {
          try {
            const settings = track.getSettings();
            const w = settings?.width || videoEl.videoWidth || 640;
            const h = settings?.height || videoEl.videoHeight || 360;
            if (!w || !h) {
              setTimeout(tryCapture, 60);
              return;
            }
            const canvas = getCanvas();
            const scale = Math.min(1, maxVideoWidth / w);
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
            socket.emit("video_frame", {
              kind,
              frame: dataUrl,
              width: canvas.width,
              height: canvas.height,
            });
          } catch {}
        };
        videoEl.onloadedmetadata = () => {
          videoEl.play().catch(() => {});
          tryCapture();
        };
        setTimeout(() => {
          if ((videoEl as any).readyState >= 2) tryCapture();
        }, 140);
      };

      fallbackElementCapture();
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
          updateOutgoingTracks();
        } else {
          await startMicrophone();
          setPubState((s) => ({ ...s, audio: true }));
          updateOutgoingTracks();
        }
      } else if (kind === "video") {
        if (pubState.video) {
          stopCamera();
          setPubState((s) => ({ ...s, video: false }));
          updateOutgoingTracks();
        } else {
          await startCamera();
          setPubState((s) => ({ ...s, video: true }));
          updateOutgoingTracks();
        }
      } else if (kind === "screen") {
        if (pubState.screen) {
          stopScreen();
          setPubState((s) => ({ ...s, screen: false }));
          updateOutgoingTracks();
        } else {
          await startScreen();
          setPubState((s) => ({ ...s, screen: true }));
          updateOutgoingTracks();
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
    [
      pubState,
      startCamera,
      startMicrophone,
      startScreen,
      captureAndSendVideoFrame,
    ]
  );

  const stopAllPublishing = () => {
    stopCamera();
    stopMicrophone();
    stopScreen();
    stopUrlShare();
    setPubState({ audio: false, video: false, screen: false, url: false });
    // Also mark self peer (if present) as not publishing so remote clients reflect state quickly on reconnection
    addOrUpdatePeer(selfId, { publishing: { audio: false, video: false } });
    updateOutgoingTracks();
  };

  /* ─────────────────────────  WEBRTC HELPERS  ───────────────────────── */
  const ensurePeerConnection = (peerId: string): RTCPeerConnection => {
    let pc = pcMapRef.current.get(peerId);
    if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers });
    pcMapRef.current.set(peerId, pc);
    makingOfferRef.current.set(peerId, false);
    ignoreOfferRef.current.set(peerId, false);
    pendingCandidatesRef.current.set(peerId, []);

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit("rtc_ice_candidate", {
          to: peerId,
          candidate: e.candidate.toJSON(),
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === "failed") {
        // Attempt graceful restart by renegotiation
        tryRenegotiate(peerId);
      }
      if (
        pc?.connectionState === "closed" ||
        pc?.connectionState === "disconnected"
      ) {
        // We'll let participant_left handle cleanup — but if remote side vanished silently, we can still retain tracks for a bit.
      }
    };
    pc.ontrack = (e) => {
      console.log(
        `[RTC] Track received from ${peerId}:`,
        e.track.kind,
        e.track.label,
        e.track.id
      );

      // Detect if this is a screen share track
      const isScreenTrack =
        e.track.kind === "video" &&
        (e.track.label.toLowerCase().includes("screen") ||
          e.track.label.toLowerCase().includes("window") ||
          e.track.label.toLowerCase().includes("display"));

      if (isScreenTrack) {
        // Handle screen share separately
        let screenStream = remoteStreamMapRef.current.get(`${peerId}-screen`);
        if (!screenStream) {
          screenStream = new MediaStream();
          remoteStreamMapRef.current.set(`${peerId}-screen`, screenStream);
        }
        const existing = screenStream
          .getTracks()
          .find((t) => t.id === e.track.id);
        if (!existing) {
          screenStream.addTrack(e.track);
          console.log(`[RTC] Added screen track for ${peerId}`);
          // Listen for track end to clean up
          e.track.onended = () => {
            console.log(`[RTC] Screen track ended for ${peerId}`);
            screenStream?.removeTrack(e.track);
            if (screenStream?.getTracks().length === 0) {
              remoteStreamMapRef.current.delete(`${peerId}-screen`);
              addOrUpdatePeer(peerId, { screenStream: null });
            } else {
              // Create new stream reference to trigger React update
              const newScreenStream = new MediaStream(screenStream.getTracks());
              remoteStreamMapRef.current.set(
                `${peerId}-screen`,
                newScreenStream
              );
              addOrUpdatePeer(peerId, { screenStream: newScreenStream });
            }
          };
        }
        addOrUpdatePeer(peerId, { screenStream });
      } else {
        // Handle regular camera/audio tracks
        const stream = attachRemoteTrack(peerId, e.track);
        console.log(`[RTC] Added ${e.track.kind} track for ${peerId}`);

        // Listen for track end to update publishing state
        e.track.onended = () => {
          console.log(`[RTC] ${e.track.kind} track ended for ${peerId}`);
          const currentStream = remoteStreamMapRef.current.get(peerId);
          if (currentStream) {
            currentStream.removeTrack(e.track);
            // Force a new stream reference if no video tracks remain
            const hasVideo = currentStream.getVideoTracks().length > 0;
            const hasAudio = currentStream.getAudioTracks().length > 0;

            // Create a new MediaStream to trigger React update
            const newStream = new MediaStream(currentStream.getTracks());
            remoteStreamMapRef.current.set(peerId, newStream);

            addOrUpdatePeer(peerId, {
              stream: newStream,
              publishing: {
                audio: hasAudio,
                video: hasVideo,
              },
            });
          }
        };

        addOrUpdatePeer(peerId, {
          stream,
          publishing: {
            audio: stream.getAudioTracks().length > 0,
            video: stream.getVideoTracks().length > 0,
          },
        });
      }
    };
    pc.onnegotiationneeded = async () => {
      tryRenegotiate(peerId);
    };

    // Monitor track states to detect when tracks become inactive
    const trackMonitorInterval = setInterval(() => {
      const stream = remoteStreamMapRef.current.get(peerId);
      const screenStream = remoteStreamMapRef.current.get(`${peerId}-screen`);

      if (stream) {
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        const hasLiveVideo = videoTracks.some(
          (t) => t.readyState === "live" && t.enabled
        );
        const hasLiveAudio = audioTracks.some(
          (t) => t.readyState === "live" && t.enabled
        );

        // Update publishing state if tracks are no longer live
        const currentPeer = remotePeersRef.current.find((p) => p.id === peerId);
        if (currentPeer) {
          const needsUpdate =
            currentPeer.publishing.video !== hasLiveVideo ||
            currentPeer.publishing.audio !== hasLiveAudio;

          if (needsUpdate) {
            console.log(
              `[RTC] Track state changed for ${peerId}: video=${hasLiveVideo}, audio=${hasLiveAudio}`
            );
            // Create new stream to trigger React update
            const newStream = new MediaStream([
              ...videoTracks.filter((t) => t.readyState === "live"),
              ...audioTracks.filter((t) => t.readyState === "live"),
            ]);
            remoteStreamMapRef.current.set(peerId, newStream);
            addOrUpdatePeer(peerId, {
              stream: newStream,
              publishing: {
                video: hasLiveVideo,
                audio: hasLiveAudio,
              },
            });
          }
        }
      }

      if (screenStream) {
        const screenTracks = screenStream.getVideoTracks();
        const hasLiveScreen = screenTracks.some(
          (t) => t.readyState === "live" && t.enabled
        );
        if (!hasLiveScreen && screenTracks.length > 0) {
          console.log(`[RTC] Screen track inactive for ${peerId}`);
          remoteStreamMapRef.current.delete(`${peerId}-screen`);
          addOrUpdatePeer(peerId, { screenStream: null });
        }
      }
    }, 1000); // Check every second

    // Store interval ID for cleanup
    if (!pcMapRef.current.has(peerId)) {
      (pc as any)._trackMonitorInterval = trackMonitorInterval;
    }

    // Immediately add any existing local tracks if present
    updateOutgoingTracksForPeer(peerId, pc);
    return pc;
  };

  const attachRemoteTrack = (peerId: string, track: MediaStreamTrack) => {
    let stream = remoteStreamMapRef.current.get(peerId);
    if (!stream) {
      stream = new MediaStream();
      remoteStreamMapRef.current.set(peerId, stream);
    }
    // Remove any existing tracks of the same kind (replace old with new)
    if (track.kind === "video") {
      stream.getVideoTracks().forEach((t) => stream!.removeTrack(t));
    } else if (track.kind === "audio") {
      stream.getAudioTracks().forEach((t) => stream!.removeTrack(t));
    }
    // Add the new track
    stream.addTrack(track);
    return stream;
  };

  const tryRenegotiate = async (peerId: string) => {
    const pc = pcMapRef.current.get(peerId);
    const socket = socketRef.current;
    if (!pc || !socket) return;
    if (pc.signalingState === "closed") return;
    try {
      makingOfferRef.current.set(peerId, true);
      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") return; // abort if became unstable
      await pc.setLocalDescription(offer);
      socket.emit("rtc_offer", {
        to: peerId,
        description: pc.localDescription,
      });
    } catch (e) {
      // ignore
    } finally {
      makingOfferRef.current.set(peerId, false);
    }
  };

  const flushQueuedCandidates = async (peerId: string) => {
    const pc = pcMapRef.current.get(peerId);
    if (!pc) return;
    const list = pendingCandidatesRef.current.get(peerId) || [];
    for (const c of list) {
      try {
        await pc.addIceCandidate(c);
      } catch {}
    }
    pendingCandidatesRef.current.set(peerId, []);
  };

  const updateOutgoingTracks = () => {
    pcMapRef.current.forEach((pc, peerId) => {
      updateOutgoingTracksForPeer(peerId, pc);
    });
  };

  const updateOutgoingTracksForPeer = (
    peerId: string,
    pc: RTCPeerConnection
  ) => {
    const localMedia = localStreamRef.current; // camera + mic merged
    const screenMedia = screenStreamRef.current;

    // Build map of desired tracks by kind and label
    const desiredByKind: Map<string, MediaStreamTrack> = new Map();

    if (pubState.video && localMedia) {
      const vt = localMedia.getVideoTracks()[0];
      if (vt) desiredByKind.set("video-camera", vt);
    }
    if (pubState.audio && localMedia) {
      const at = localMedia.getAudioTracks()[0];
      if (at) desiredByKind.set("audio", at);
    }
    if (pubState.screen && screenMedia) {
      const st = screenMedia.getVideoTracks()[0];
      if (st) desiredByKind.set("video-screen", st);
    }

    // Process existing senders
    const senders = pc.getSenders();
    const processedKinds = new Set<string>();

    for (const sender of senders) {
      if (!sender.track) continue;

      const isScreen =
        sender.track.label.includes("screen") ||
        sender.track.label.includes("window");
      const key =
        sender.track.kind === "video"
          ? isScreen
            ? "video-screen"
            : "video-camera"
          : "audio";

      const desiredTrack = desiredByKind.get(key);

      if (!desiredTrack) {
        // No longer needed, remove it
        try {
          pc.removeTrack(sender);
        } catch {}
      } else if (desiredTrack.id !== sender.track.id) {
        // Track changed, replace it
        try {
          sender.replaceTrack(desiredTrack).catch(() => {
            // If replace fails, remove and re-add
            pc.removeTrack(sender);
            pc.addTrack(desiredTrack);
          });
        } catch {}
        processedKinds.add(key);
      } else {
        // Same track, mark as processed
        processedKinds.add(key);
      }
    }

    // Add tracks that weren't processed (new tracks)
    desiredByKind.forEach((track, key) => {
      if (!processedKinds.has(key)) {
        try {
          pc.addTrack(track);
        } catch {}
      }
    });
  };

  const closePeerConnection = (peerId: string) => {
    const pc = pcMapRef.current.get(peerId);
    if (pc) {
      // Clear track monitor interval
      if ((pc as any)._trackMonitorInterval) {
        clearInterval((pc as any)._trackMonitorInterval);
      }
      try {
        pc.ontrack = null;
      } catch {}
      try {
        pc.close();
      } catch {}
    }
    pcMapRef.current.delete(peerId);
    makingOfferRef.current.delete(peerId);
    ignoreOfferRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    remoteStreamMapRef.current.delete(peerId);
    remoteStreamMapRef.current.delete(`${peerId}-screen`);
  };

  // Initial self join track advertisement (if user enables before peers join)
  useEffect(() => {
    if (!joined) return;
    updateOutgoingTracks();
  }, [joined, pubState.audio, pubState.video, pubState.screen]);

  // In perfect negotiation pattern, we might need to ignore offers if glare & impolite; currently handled inline.

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
