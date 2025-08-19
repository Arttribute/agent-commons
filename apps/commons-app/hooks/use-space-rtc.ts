// apps/commons-app/hooks/use-space-rtc.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

type Role = "human" | "agent";

interface RemotePeer {
  id: string;
  role: Role;
  stream?: MediaStream;
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
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const localUrlStreamRef = useRef<MediaStream | null>(null);
  const urlCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const urlContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const currentUrlSessionRef = useRef<string | null>(null);

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const screenPeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(
    new Map()
  );
  const urlPeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(
    new Map()
  );

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
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    screenPeerConnectionsRef.current.forEach((pc) => pc.close());
    screenPeerConnectionsRef.current.clear();

    urlPeerConnectionsRef.current.forEach((pc) => pc.close());
    urlPeerConnectionsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
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

      // Initialize peers
      const initialPeers: RemotePeer[] = data.participants.map((peer: any) => ({
        id: peer.id,
        role: peer.role,
        publishing: peer.publishing || { audio: false, video: false },
        screenSharing: peer.screenSharing || false,
        urlSharing: peer.urlSharing || { active: false },
      }));

      setRemotePeers(initialPeers);

      // Create peer connections
      data.participants.forEach((peer: any) => {
        createPeerConnection(peer.id, true);
        createScreenPeerConnection(peer.id, true);
        createUrlPeerConnection(peer.id, true);
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
          await handleOffer(message.fromId, message.data, message.streamType);
          break;

        case "answer":
          await handleAnswer(message.fromId, message.data, message.streamType);
          break;

        case "candidate":
          await handleCandidate(
            message.fromId,
            message.data,
            message.streamType
          );
          break;

        case "publishState":
          updatePeerPublishing(
            message.fromId,
            message.publish,
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
  }, [spaceId, selfId, role, wsUrl, cleanup]);

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

  const addRemotePeer = (id: string, peerRole: Role) => {
    setRemotePeers((prev) => {
      if (prev.find((p) => p.id === id)) return prev;
      return [
        ...prev,
        {
          id,
          role: peerRole,
          publishing: { audio: false, video: false },
          screenSharing: false,
          urlSharing: { active: false },
        },
      ];
    });
  };

  const removeRemotePeer = (id: string) => {
    setRemotePeers((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePeerPublishing = (
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
            return {
              ...p,
              urlSharing: {
                active: !!url,
                url: url || undefined,
                sessionId: sessionId || undefined,
              },
            };
          } else if (streamType === "screen") {
            return { ...p, screenSharing: !!publishing?.video };
          } else if (publishing) {
            return { ...p, publishing };
          }
        }
        return p;
      })
    );
  };

  // Create URL peer connection
  const createUrlPeerConnection = (
    peerId: string,
    shouldCreateOffer: boolean
  ) => {
    const urlKey = `${peerId}-url`;
    if (urlPeerConnectionsRef.current.has(urlKey)) return;

    console.log(
      `[RTC] Creating URL peer connection for ${peerId}, shouldCreateOffer: ${shouldCreateOffer}`
    );
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("signal", {
          type: "candidate",
          spaceId,
          fromId: selfId,
          targetId: peerId,
          data: event.candidate,
          streamType: "url",
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("[RTC] Remote URL track received from", peerId);
      const [remoteStream] = event.streams;
      setRemotePeers((prev) =>
        prev.map((p) =>
          p.id === peerId ? { ...p, urlStream: remoteStream } : p
        )
      );
    };

    if (localUrlStreamRef.current) {
      localUrlStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localUrlStreamRef.current!);
      });
    }

    urlPeerConnectionsRef.current.set(urlKey, pc);

    if (shouldCreateOffer) {
      createUrlOffer(peerId);
    }
  };

  const createUrlOffer = async (peerId: string) => {
    const urlKey = `${peerId}-url`;
    const pc = urlPeerConnectionsRef.current.get(urlKey);
    if (!pc) return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit("signal", {
        type: "offer",
        spaceId,
        fromId: selfId,
        targetId: peerId,
        data: offer,
        streamType: "url",
      });
    } catch (error) {
      console.error("[RTC] Create URL offer failed:", error);
    }
  };

  // Handle offers with stream type
  const handleOffer = async (
    peerId: string,
    offer: RTCSessionDescriptionInit,
    streamType?: string
  ) => {
    let pc: RTCPeerConnection;

    if (streamType === "url") {
      const urlKey = `${peerId}-url`;
      if (!urlPeerConnectionsRef.current.has(urlKey)) {
        createUrlPeerConnection(peerId, false);
      }
      pc = urlPeerConnectionsRef.current.get(urlKey)!;
    } else if (streamType === "screen") {
      const screenKey = `${peerId}-screen`;
      if (!screenPeerConnectionsRef.current.has(screenKey)) {
        createScreenPeerConnection(peerId, false);
      }
      pc = screenPeerConnectionsRef.current.get(screenKey)!;
    } else {
      if (!peerConnectionsRef.current.has(peerId)) {
        createPeerConnection(peerId, false);
      }
      pc = peerConnectionsRef.current.get(peerId)!;
    }

    try {
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
      console.error("[RTC] Handle offer failed:", error);
    }
  };

  const handleAnswer = async (
    peerId: string,
    answer: RTCSessionDescriptionInit,
    streamType?: string
  ) => {
    let pc: RTCPeerConnection | undefined;

    if (streamType === "url") {
      const urlKey = `${peerId}-url`;
      pc = urlPeerConnectionsRef.current.get(urlKey);
    } else if (streamType === "screen") {
      const screenKey = `${peerId}-screen`;
      pc = screenPeerConnectionsRef.current.get(screenKey);
    } else {
      pc = peerConnectionsRef.current.get(peerId);
    }

    if (!pc) return;

    try {
      await pc.setRemoteDescription(answer);
    } catch (error) {
      console.error("[RTC] Handle answer failed:", error);
    }
  };

  const handleCandidate = async (
    peerId: string,
    candidate: RTCIceCandidateInit,
    streamType?: string
  ) => {
    let pc: RTCPeerConnection | undefined;

    if (streamType === "url") {
      const urlKey = `${peerId}-url`;
      pc = urlPeerConnectionsRef.current.get(urlKey);
    } else if (streamType === "screen") {
      const screenKey = `${peerId}-screen`;
      pc = screenPeerConnectionsRef.current.get(screenKey);
    } else {
      pc = peerConnectionsRef.current.get(peerId);
    }

    if (!pc) return;

    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.error("[RTC] Add candidate failed:", error);
    }
  };

  // Start URL streaming
  const startUrlShare = async (url: string) => {
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
        urlPeerConnectionsRef.current.forEach(async (pc, key) => {
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
          const peerId = key.replace("-url", "");
          await createUrlOffer(peerId);
        });

        return stream;
      }

      throw new Error("Failed to create canvas stream");
    } catch (error) {
      console.error("[RTC] Start URL share failed:", error);
      throw error;
    }
  };

  const stopUrlShare = () => {
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
  };

  // Keep existing functions for regular camera and screen sharing...
  const createPeerConnection = (peerId: string, shouldCreateOffer: boolean) => {
    if (peerConnectionsRef.current.has(peerId)) return;

    console.log(
      `[RTC] Creating peer connection for ${peerId}, shouldCreateOffer: ${shouldCreateOffer}`
    );
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("signal", {
          type: "candidate",
          spaceId,
          fromId: selfId,
          targetId: peerId,
          data: event.candidate,
          streamType: "camera",
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("[RTC] Remote track received from", peerId);
      const [remoteStream] = event.streams;
      setRemotePeers((prev) =>
        prev.map((p) => (p.id === peerId ? { ...p, stream: remoteStream } : p))
      );
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionsRef.current.set(peerId, pc);

    if (shouldCreateOffer) {
      createOffer(peerId);
    }
  };

  const createScreenPeerConnection = (
    peerId: string,
    shouldCreateOffer: boolean
  ) => {
    const screenKey = `${peerId}-screen`;
    if (screenPeerConnectionsRef.current.has(screenKey)) return;

    console.log(
      `[RTC] Creating screen peer connection for ${peerId}, shouldCreateOffer: ${shouldCreateOffer}`
    );
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("signal", {
          type: "candidate",
          spaceId,
          fromId: selfId,
          targetId: peerId,
          data: event.candidate,
          streamType: "screen",
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("[RTC] Remote screen track received from", peerId);
      const [remoteScreenStream] = event.streams;
      setRemotePeers((prev) =>
        prev.map((p) =>
          p.id === peerId
            ? { ...p, screenStream: remoteScreenStream, screenSharing: true }
            : p
        )
      );
    };

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localScreenStreamRef.current!);
      });
    }

    screenPeerConnectionsRef.current.set(screenKey, pc);

    if (shouldCreateOffer) {
      createScreenOffer(peerId);
    }
  };

  const removePeerConnection = (peerId: string) => {
    // Remove regular connection
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }

    // Remove screen connection
    const screenKey = `${peerId}-screen`;
    const screenPc = screenPeerConnectionsRef.current.get(screenKey);
    if (screenPc) {
      screenPc.close();
      screenPeerConnectionsRef.current.delete(screenKey);
    }

    // Remove URL connection
    const urlKey = `${peerId}-url`;
    const urlPc = urlPeerConnectionsRef.current.get(urlKey);
    if (urlPc) {
      urlPc.close();
      urlPeerConnectionsRef.current.delete(urlKey);
    }
  };

  const startPublishing = async ({ audio = true, video = true }) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video,
      });
      localStreamRef.current = stream;

      peerConnectionsRef.current.forEach(async (pc, peerId) => {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
        await createOffer(peerId);
      });

      socketRef.current?.emit("signal", {
        type: "publishState",
        spaceId,
        fromId: selfId,
        publish: { audio, video },
        streamType: "camera",
      });

      return stream;
    } catch (error) {
      console.error("[RTC] Start publishing failed:", error);
      throw error;
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      localScreenStreamRef.current = stream;

      screenPeerConnectionsRef.current.forEach(async (pc, key) => {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
        const peerId = key.replace("-screen", "");
        await createScreenOffer(peerId);
      });

      peerConnectionsRef.current.forEach(async (_, peerId) => {
        const screenKey = `${peerId}-screen`;
        if (!screenPeerConnectionsRef.current.has(screenKey)) {
          createScreenPeerConnection(peerId, true);
        }
      });

      socketRef.current?.emit("signal", {
        type: "publishState",
        spaceId,
        fromId: selfId,
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
  };

  const createOffer = async (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (!pc) return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit("signal", {
        type: "offer",
        spaceId,
        fromId: selfId,
        targetId: peerId,
        data: offer,
        streamType: "camera",
      });
    } catch (error) {
      console.error("[RTC] Create offer failed:", error);
    }
  };

  const createScreenOffer = async (peerId: string) => {
    const screenKey = `${peerId}-screen`;
    const pc = screenPeerConnectionsRef.current.get(screenKey);
    if (!pc) return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit("signal", {
        type: "offer",
        spaceId,
        fromId: selfId,
        targetId: peerId,
        data: offer,
        streamType: "screen",
      });
    } catch (error) {
      console.error("[RTC] Create screen offer failed:", error);
    }
  };

  const stopPublishing = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    peerConnectionsRef.current.forEach(async (pc, peerId) => {
      const senders = pc.getSenders();
      senders.forEach((sender) => {
        if (sender.track) {
          pc.removeTrack(sender);
        }
      });
      await createOffer(peerId);
    });

    socketRef.current?.emit("signal", {
      type: "publishState",
      spaceId,
      fromId: selfId,
      publish: { audio: false, video: false },
      streamType: "camera",
    });
  };

  const stopScreenShare = () => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
    }

    screenPeerConnectionsRef.current.forEach(async (pc, key) => {
      const senders = pc.getSenders();
      senders.forEach((sender) => {
        if (sender.track) {
          pc.removeTrack(sender);
        }
      });
      const peerId = key.replace("-screen", "");
      await createScreenOffer(peerId);
    });

    socketRef.current?.emit("signal", {
      type: "publishState",
      spaceId,
      fromId: selfId,
      streamType: "screen",
    });
  };

  const leave = () => {
    socketRef.current?.emit("leave", {
      type: "leave",
      spaceId,
      fromId: selfId,
    });

    cleanup();
  };

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
