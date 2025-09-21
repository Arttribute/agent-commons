// apps/commons-app/hooks/use-space-rtc.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

type Role = "human" | "agent";

interface RemotePeer {
  id: string;
  role: Role;
  stream?: MediaStream; // camera/video stream
  audioStream?: MediaStream; // separate audio-only stream
  screenStream?: MediaStream;
  urlStream?: MediaStream;
  publishing: { audio: boolean; video: boolean };
  screenSharing: boolean;
  urlSharing: { active: boolean; url?: string; sessionId?: string };
}

interface UseSpaceRTCProps {
  spaceId: string;
  selfId: string;
  role: Role;
  wsUrl: string;
}

interface PeerConnection {
  pc: RTCPeerConnection;
  isNegotiating: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
}

export function useSpaceRTC({
  spaceId,
  selfId,
  role,
  wsUrl,
}: UseSpaceRTCProps) {
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const localUrlStreamRef = useRef<MediaStream | null>(null);
  const urlCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const urlContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const currentUrlSessionRef = useRef<string | null>(null);

  // Use separate connection maps with proper state tracking
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const audioPeerConnectionsRef = useRef<Map<string, PeerConnection>>(
    new Map()
  );
  const screenPeerConnectionsRef = useRef<Map<string, PeerConnection>>(
    new Map()
  );
  const urlPeerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());

  const iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];

  // Create canvas for web capture frames
  const initializeUrlCanvas = useCallback(() => {
    if (!urlCanvasRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      urlCanvasRef.current = canvas;
      urlContextRef.current = canvas.getContext("2d");
    }
  }, []);

  // Clean up function
  const cleanup = useCallback(() => {
    peerConnectionsRef.current.forEach(({ pc }) => pc.close());
    peerConnectionsRef.current.clear();

    screenPeerConnectionsRef.current.forEach(({ pc }) => pc.close());
    screenPeerConnectionsRef.current.clear();

    urlPeerConnectionsRef.current.forEach(({ pc }) => pc.close());
    urlPeerConnectionsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      localAudioStreamRef.current = null;
    }

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
    }

    if (localUrlStreamRef.current) {
      localUrlStreamRef.current.getTracks().forEach((track) => track.stop());
      localUrlStreamRef.current = null;
    }

    setRemotePeers([]);
    setJoined(false);
  }, []);

  // Create peer connection with proper state management
  const createPeerConnection = useCallback(
    (
      peerId: string,
      connectionMap: React.MutableRefObject<Map<string, PeerConnection>>,
      streamType: string,
      localStream?: MediaStream
    ): PeerConnection => {
      const key = streamType === "camera" ? peerId : `${peerId}-${streamType}`;

      if (connectionMap.current.has(key)) {
        return connectionMap.current.get(key)!;
      }

      console.log(`[RTC] Creating ${streamType} peer connection for ${peerId}`);

      const pc = new RTCPeerConnection({ iceServers });
      const peerConnection: PeerConnection = {
        pc,
        isNegotiating: false,
        makingOffer: false,
        ignoreOffer: false,
      };

      // Handle negotiation state
      pc.onnegotiationneeded = async () => {
        if (peerConnection.isNegotiating) {
          console.log(`[RTC] Already negotiating for ${key}, skipping`);
          return;
        }

        try {
          peerConnection.isNegotiating = true;
          peerConnection.makingOffer = true;

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socketRef.current?.emit("signal", {
            type: "offer",
            spaceId,
            fromId: selfId,
            targetId: peerId,
            data: offer,
            // Always tag streamType explicitly
            streamType,
          });
        } catch (error) {
          console.error(`[RTC] Create offer failed for ${key}:`, error);
        } finally {
          peerConnection.makingOffer = false;
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("signal", {
            type: "candidate",
            spaceId,
            fromId: selfId,
            targetId: peerId,
            data: event.candidate,
            streamType,
          });
        }
      };

      pc.ontrack = (event) => {
        console.log(`[RTC] Remote ${streamType} track received from`, peerId);
        const [remoteStream] = event.streams;

        setRemotePeers((prev) =>
          prev.map((p) => {
            if (p.id === peerId) {
              switch (streamType) {
                case "audio":
                  return {
                    ...p,
                    audioStream: remoteStream,
                    publishing: { ...p.publishing, audio: true },
                  };
                case "screen":
                  return {
                    ...p,
                    screenStream: remoteStream,
                    screenSharing: true,
                  };
                case "url":
                  return { ...p, urlStream: remoteStream };
                default:
                  return { ...p, stream: remoteStream };
              }
            }
            return p;
          })
        );
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `[RTC] ICE connection state for ${key}:`,
          pc.iceConnectionState
        );
        if (pc.iceConnectionState === "failed") {
          console.log(`[RTC] ICE connection failed for ${key}, restarting ICE`);
          pc.restartIce();
        }
      };

      pc.onsignalingstatechange = () => {
        if (pc.signalingState === "stable") {
          peerConnection.isNegotiating = false;
        }
      };

      // Add local stream if provided
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      connectionMap.current.set(key, peerConnection);
      return peerConnection;
    },
    [spaceId, selfId]
  );

  // Handle offers with proper state management
  const handleOffer = useCallback(
    async (
      peerId: string,
      offer: RTCSessionDescriptionInit,
      streamType?: string
    ) => {
      const connectionMap =
        streamType === "url"
          ? urlPeerConnectionsRef
          : streamType === "screen"
            ? screenPeerConnectionsRef
            : streamType === "audio"
              ? audioPeerConnectionsRef
              : peerConnectionsRef;

      const localStream =
        streamType === "url"
          ? localUrlStreamRef.current
          : streamType === "screen"
            ? localScreenStreamRef.current
            : streamType === "audio"
              ? localAudioStreamRef.current
              : localStreamRef.current;

      const peerConnection = createPeerConnection(
        peerId,
        connectionMap,
        streamType || "camera",
        localStream || undefined
      );

      const { pc } = peerConnection;

      try {
        // Handle perfect negotiation
        const offerCollision =
          peerConnection.makingOffer || pc.signalingState !== "stable";
        peerConnection.ignoreOffer = !offerCollision && selfId < peerId;

        if (peerConnection.ignoreOffer) {
          console.log(`[RTC] Ignoring offer from ${peerId} due to collision`);
          return;
        }

        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketRef.current?.emit("signal", {
          type: "answer",
          spaceId,
          fromId: selfId,
          targetId: peerId,
          data: answer,
          streamType,
        });
      } catch (error) {
        console.error(`[RTC] Handle offer failed for ${peerId}:`, error);
      }
    },
    [createPeerConnection, spaceId, selfId]
  );

  const handleAnswer = useCallback(
    async (
      peerId: string,
      answer: RTCSessionDescriptionInit,
      streamType?: string
    ) => {
      const connectionMap =
        streamType === "url"
          ? urlPeerConnectionsRef
          : streamType === "screen"
            ? screenPeerConnectionsRef
            : streamType === "audio"
              ? audioPeerConnectionsRef
              : peerConnectionsRef;

      const key =
        streamType === "camera" || !streamType
          ? peerId
          : `${peerId}-${streamType}`;
      const peerConnection = connectionMap.current.get(key);

      if (!peerConnection) {
        console.warn(
          `[RTC] No peer connection found for answer from ${peerId}`
        );
        return;
      }

      try {
        await peerConnection.pc.setRemoteDescription(answer);
        peerConnection.isNegotiating = false;
      } catch (error) {
        console.error(`[RTC] Handle answer failed for ${peerId}:`, error);
      }
    },
    []
  );

  const handleCandidate = useCallback(
    async (
      peerId: string,
      candidate: RTCIceCandidateInit,
      streamType?: string
    ) => {
      const connectionMap =
        streamType === "url"
          ? urlPeerConnectionsRef
          : streamType === "screen"
            ? screenPeerConnectionsRef
            : streamType === "audio"
              ? audioPeerConnectionsRef
              : peerConnectionsRef;

      const key =
        streamType === "camera" || !streamType
          ? peerId
          : `${peerId}-${streamType}`;
      const peerConnection = connectionMap.current.get(key);

      if (!peerConnection) {
        console.warn(
          `[RTC] No peer connection found for candidate from ${peerId}`
        );
        return;
      }

      try {
        await peerConnection.pc.addIceCandidate(candidate);
      } catch (error) {
        console.error(`[RTC] Add candidate failed for ${peerId}:`, error);
      }
    },
    []
  );

  // Initialize socket connection
  useEffect(() => {
    console.log(`[RTC] Connecting to ${wsUrl}/rtc`);

    const socket = io(`${wsUrl}/rtc`, {
      transports: ["websocket"],
      autoConnect: true,
    });

    socket.on("connect", () => {
      console.log("[RTC] Socket connected");
      setConnected(true);

      socket.emit("join", {
        type: "join",
        spaceId,
        fromId: selfId,
        role,
      });
    });

    socket.on("disconnect", () => {
      console.log("[RTC] Socket disconnected");
      setConnected(false);
      setJoined(false);
    });

    socket.on("joined", (data) => {
      console.log("[RTC] Joined space:", data);
      setJoined(true);

      // Initialize peers from participants
      const initialPeers: RemotePeer[] = data.participants.map((peer: any) => ({
        id: peer.id,
        role: peer.role,
        publishing: peer.publishing || { audio: false, video: false },
        screenSharing: peer.screenSharing || false,
        urlSharing: peer.urlSharing || { active: false },
      }));

      setRemotePeers(initialPeers);

      // Create peer connections for each participant
      data.participants.forEach((peer: any) => {
        // Create camera connection; attach local camera stream if present
        createPeerConnection(
          peer.id,
          peerConnectionsRef,
          "camera",
          localStreamRef.current || undefined
        );

        // Create audio connection; attach local audio stream if present
        createPeerConnection(
          peer.id,
          audioPeerConnectionsRef,
          "audio",
          localAudioStreamRef.current || undefined
        );

        // Create screen connection if they're screen sharing
        if (peer.screenSharing) {
          createPeerConnection(peer.id, screenPeerConnectionsRef, "screen");
        }

        // Create URL connection if they're sharing URL
        if (peer.urlSharing?.active) {
          createPeerConnection(peer.id, urlPeerConnectionsRef, "url");
        }
      });
    });

    // Handle web capture frames
    socket.on("webFrame", (data) => {
      handleWebFrame(data);
    });

    socket.on("webCaptureStarted", (data) => {
      console.log("[RTC] Web capture started:", data);
    });

    socket.on("webCaptureError", (data) => {
      console.error("[RTC] Web capture error:", data.error);
    });

    socket.on("webCaptureStopped", (data) => {
      console.log("[RTC] Web capture stopped:", data);
    });

    socket.on("signal", async (message) => {
      console.log("[RTC] Signal received:", message.type, message);

      switch (message.type) {
        case "peer-joined":
          if (message.fromId !== selfId) {
            addRemotePeer(message.fromId, message.role);
          }
          break;

        case "peer-left":
          removePeerConnection(message.fromId);
          removeRemotePeer(message.fromId);
          break;

        case "offer":
          if (message.targetId === selfId) {
            await handleOffer(message.fromId, message.data, message.streamType);
          }
          break;

        case "answer":
          if (message.targetId === selfId) {
            await handleAnswer(
              message.fromId,
              message.data,
              message.streamType
            );
          }
          break;

        case "candidate":
          if (message.targetId === selfId) {
            await handleCandidate(
              message.fromId,
              message.data,
              message.streamType
            );
          }
          break;

        case "publishState":
          updatePeerPublishing(
            message.fromId,
            // Prefer new schema first
            message.data ?? message.publish,
            message.streamType,
            message.url,
            message.sessionId
          );
          break;
      }
    });

    socketRef.current = socket;

    return () => {
      cleanup();
      socket.disconnect();
    };
  }, [
    spaceId,
    selfId,
    role,
    wsUrl,
    cleanup,
    createPeerConnection,
    handleOffer,
    handleAnswer,
    handleCandidate,
  ]);

  const handleWebFrame = useCallback(
    (data: {
      sessionId: string;
      participantId: string;
      frame: string;
      timestamp: number;
    }) => {
      if (!urlCanvasRef.current || !urlContextRef.current) {
        initializeUrlCanvas();
      }

      // Create image from base64 frame
      const img = new Image();
      img.onload = () => {
        if (urlContextRef.current && urlCanvasRef.current) {
          // Clear canvas and draw new frame
          urlContextRef.current.clearRect(
            0,
            0,
            urlCanvasRef.current.width,
            urlCanvasRef.current.height
          );
          urlContextRef.current.drawImage(
            img,
            0,
            0,
            urlCanvasRef.current.width,
            urlCanvasRef.current.height
          );
        }
      };
      img.src = `data:image/jpeg;base64,${data.frame}`;

      // Update peer's URL stream if this is from a remote peer
      if (data.participantId !== selfId) {
        setRemotePeers((prev) =>
          prev.map((p) => {
            if (
              p.id === data.participantId &&
              p.urlSharing.sessionId === data.sessionId
            ) {
              if (!p.urlStream && urlCanvasRef.current) {
                // Create stream from canvas
                const stream = urlCanvasRef.current.captureStream(15); // 15 FPS
                return { ...p, urlStream: stream };
              }
            }
            return p;
          })
        );
      }
    },
    [selfId, initializeUrlCanvas]
  );

  const addRemotePeer = useCallback(
    (id: string, peerRole: Role) => {
      setRemotePeers((prev) => {
        if (prev.find((p) => p.id === id)) return prev;

        const newPeer: RemotePeer = {
          id,
          role: peerRole,
          publishing: { audio: false, video: false },
          screenSharing: false,
          urlSharing: { active: false },
        };

        // Create peer connections for new peer and attach any existing local streams
        createPeerConnection(
          id,
          peerConnectionsRef,
          "camera",
          localStreamRef.current || undefined
        );
        createPeerConnection(
          id,
          audioPeerConnectionsRef,
          "audio",
          localAudioStreamRef.current || undefined
        );

        // If we are already sharing screen or URL locally, attach those too
        if (localScreenStreamRef.current) {
          createPeerConnection(
            id,
            screenPeerConnectionsRef,
            "screen",
            localScreenStreamRef.current
          );
        }
        if (localUrlStreamRef.current) {
          createPeerConnection(
            id,
            urlPeerConnectionsRef,
            "url",
            localUrlStreamRef.current
          );
        }

        return [...prev, newPeer];
      });
    },
    [createPeerConnection]
  );

  const removeRemotePeer = useCallback((id: string) => {
    setRemotePeers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const removePeerConnection = useCallback((peerId: string) => {
    // Remove regular connection
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.pc.close();
      peerConnectionsRef.current.delete(peerId);
    }

    // Remove screen connection
    const screenKey = `${peerId}-screen`;
    const screenPc = screenPeerConnectionsRef.current.get(screenKey);
    if (screenPc) {
      screenPc.pc.close();
      screenPeerConnectionsRef.current.delete(screenKey);
    }

    // Remove audio connection
    const audioKey = `${peerId}-audio`;
    const audioPc = audioPeerConnectionsRef.current.get(audioKey);
    if (audioPc) {
      audioPc.pc.close();
      audioPeerConnectionsRef.current.delete(audioKey);
    }

    // Remove URL connection
    const urlKey = `${peerId}-url`;
    const urlPc = urlPeerConnectionsRef.current.get(urlKey);
    if (urlPc) {
      urlPc.pc.close();
      urlPeerConnectionsRef.current.delete(urlKey);
    }
  }, []);

  const updatePeerPublishing = useCallback(
    (
      id: string,
      publishing?: { audio: boolean; video: boolean },
      streamType?: string,
      url?: string,
      sessionId?: string
    ) => {
      setRemotePeers((prev) =>
        prev.map((p) => {
          if (p.id === id) {
            if (streamType === "url") {
              const newUrlSharing = {
                active: !!url,
                url: url || undefined,
                sessionId: sessionId || undefined,
              };

              // Create URL peer connection if URL sharing is starting
              if (
                newUrlSharing.active &&
                !urlPeerConnectionsRef.current.has(`${id}-url`)
              ) {
                createPeerConnection(id, urlPeerConnectionsRef, "url");
              }

              return { ...p, urlSharing: newUrlSharing };
            } else if (streamType === "screen") {
              const isSharing =
                typeof (publishing as any)?.publishing === "boolean"
                  ? (publishing as any).publishing
                  : !!publishing?.video;

              // Create screen peer connection if screen sharing is starting
              if (
                isSharing &&
                !screenPeerConnectionsRef.current.has(`${id}-screen`)
              ) {
                createPeerConnection(id, screenPeerConnectionsRef, "screen");
              }

              return { ...p, screenSharing: isSharing };
            } else if (streamType === "audio") {
              const audioOn =
                typeof (publishing as any)?.publishing === "boolean"
                  ? (publishing as any).publishing
                  : !!publishing?.audio;
              // Ensure audio connection exists when audio starts
              if (
                audioOn &&
                !audioPeerConnectionsRef.current.has(`${id}-audio`)
              ) {
                createPeerConnection(id, audioPeerConnectionsRef, "audio");
              }
              return { ...p, publishing: { ...p.publishing, audio: audioOn } };
            } else if (streamType === "camera") {
              const videoOn =
                typeof (publishing as any)?.publishing === "boolean"
                  ? (publishing as any).publishing
                  : !!publishing?.video || !!publishing?.audio;
              return { ...p, publishing: { ...p.publishing, video: videoOn } };
            }
          }
          return p;
        })
      );
    },
    [createPeerConnection]
  );

  // Start publishing functions
  const startPublishing = useCallback(
    async ({ audio = true, video = true }) => {
      try {
        let cameraStream: MediaStream | null = null;
        let audioStream: MediaStream | null = null;

        if (video) {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15, max: 24 },
              facingMode: "user",
            },
            audio: false,
          });
          localStreamRef.current = cameraStream;
          peerConnectionsRef.current.forEach(({ pc }) => {
            cameraStream!.getTracks().forEach((track) => {
              pc.addTrack(track, cameraStream!);
            });
          });
          socketRef.current?.emit("signal", {
            type: "publishState",
            spaceId,
            fromId: selfId,
            data: { publishing: true },
            publish: { audio: !!audio, video: true }, // back-compat
            streamType: "camera",
          });
        } else {
          // If turning off camera
          socketRef.current?.emit("signal", {
            type: "publishState",
            spaceId,
            fromId: selfId,
            data: { publishing: false },
            publish: { audio: !!audio, video: false },
            streamType: "camera",
          });
        }

        if (audio) {
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          localAudioStreamRef.current = audioStream;
          audioPeerConnectionsRef.current.forEach(({ pc }) => {
            audioStream!.getTracks().forEach((track) => {
              pc.addTrack(track, audioStream!);
            });
          });
          socketRef.current?.emit("signal", {
            type: "publishState",
            spaceId,
            fromId: selfId,
            data: { publishing: true },
            publish: { audio: true, video: !!video },
            streamType: "audio",
          });
        } else {
          socketRef.current?.emit("signal", {
            type: "publishState",
            spaceId,
            fromId: selfId,
            data: { publishing: false },
            publish: { audio: false, video: !!video },
            streamType: "audio",
          });
        }

        // Return combined info for convenience
        return cameraStream || audioStream || null;
      } catch (error) {
        console.error("[RTC] Start publishing failed:", error);
        throw error;
      }
    },
    [spaceId, selfId]
  );

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 10, max: 15 },
        },
        audio: true,
      });
      localScreenStreamRef.current = stream;

      // Add tracks to existing screen peer connections
      screenPeerConnectionsRef.current.forEach(({ pc }) => {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      });

      // Create screen connections for all existing peers
      remotePeers.forEach((peer) => {
        if (!screenPeerConnectionsRef.current.has(`${peer.id}-screen`)) {
          createPeerConnection(
            peer.id,
            screenPeerConnectionsRef,
            "screen",
            stream
          );
        }
      });

      socketRef.current?.emit("signal", {
        type: "publishState",
        spaceId,
        fromId: selfId,
        publish: { audio: false, video: true },
        streamType: "screen",
      });

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      return stream;
    } catch (error) {
      console.error("[RTC] Start screen share failed:", error);
      throw error;
    }
  }, [spaceId, selfId, remotePeers, createPeerConnection]);

  const startUrlShare = useCallback(
    async (url: string) => {
      try {
        const sessionId = `url-${selfId}-${Date.now()}`;
        currentUrlSessionRef.current = sessionId;

        // Initialize canvas if not done
        initializeUrlCanvas();

        // Request server to start web capture
        socketRef.current?.emit("startWebCapture", {
          type: "startWebCapture",
          spaceId,
          fromId: selfId,
          url,
          sessionId,
        });

        // Create stream from canvas
        if (urlCanvasRef.current) {
          const stream = urlCanvasRef.current.captureStream(15); // 15 FPS
          localUrlStreamRef.current = stream;

          // Add tracks to URL peer connections
          urlPeerConnectionsRef.current.forEach(({ pc }) => {
            stream.getTracks().forEach((track) => {
              pc.addTrack(track, stream);
            });
          });

          // Create URL connections for all existing peers
          remotePeers.forEach((peer) => {
            if (!urlPeerConnectionsRef.current.has(`${peer.id}-url`)) {
              createPeerConnection(
                peer.id,
                urlPeerConnectionsRef,
                "url",
                stream
              );
            }
          });

          return stream;
        }

        throw new Error("Failed to create canvas stream");
      } catch (error) {
        console.error("[RTC] Start URL share failed:", error);
        throw error;
      }
    },
    [spaceId, selfId, remotePeers, createPeerConnection, initializeUrlCanvas]
  );

  const stopPublishing = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      // Remove camera tracks from PCs
      peerConnectionsRef.current.forEach(({ pc }) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track && sender.track.kind === "video") {
            pc.removeTrack(sender);
          }
        });
      });
      socketRef.current?.emit("signal", {
        type: "publishState",
        spaceId,
        fromId: selfId,
        data: { publishing: false },
        publish: { audio: !!localAudioStreamRef.current, video: false },
        streamType: "camera",
      });
    }

    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      localAudioStreamRef.current = null;
      // Remove audio tracks from audio PCs
      audioPeerConnectionsRef.current.forEach(({ pc }) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track && sender.track.kind === "audio") {
            pc.removeTrack(sender);
          }
        });
      });
      socketRef.current?.emit("signal", {
        type: "publishState",
        spaceId,
        fromId: selfId,
        data: { publishing: false },
        publish: { audio: false, video: !!localStreamRef.current },
        streamType: "audio",
      });
    }
  }, [spaceId, selfId]);

  const stopScreenShare = useCallback(() => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
    }

    // Remove tracks from screen peer connections
    screenPeerConnectionsRef.current.forEach(({ pc }) => {
      const senders = pc.getSenders();
      senders.forEach((sender) => {
        if (sender.track) {
          pc.removeTrack(sender);
        }
      });
    });

    socketRef.current?.emit("signal", {
      type: "publishState",
      spaceId,
      fromId: selfId,
      streamType: "screen",
    });
  }, [spaceId, selfId]);

  const stopUrlShare = useCallback(() => {
    if (currentUrlSessionRef.current) {
      socketRef.current?.emit("stopWebCapture", {
        type: "stopWebCapture",
        spaceId,
        fromId: selfId,
        sessionId: currentUrlSessionRef.current,
      });

      currentUrlSessionRef.current = null;
    }

    if (localUrlStreamRef.current) {
      localUrlStreamRef.current.getTracks().forEach((track) => track.stop());
      localUrlStreamRef.current = null;
    }
  }, [spaceId, selfId]);

  const leave = useCallback(() => {
    socketRef.current?.emit("leave", {
      type: "leave",
      spaceId,
      fromId: selfId,
    });

    cleanup();
  }, [spaceId, selfId, cleanup]);

  return {
    connected,
    joined,
    remotePeers,
    localStream: localStreamRef,
    localScreenStream: localScreenStreamRef,
    localUrlStream: localUrlStreamRef,
    startPublishing,
    stopPublishing,
    startScreenShare,
    stopScreenShare,
    startUrlShare,
    stopUrlShare,
    leave,
  };
}
