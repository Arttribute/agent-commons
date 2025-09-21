import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
// @ts-ignore
import wrtc from '@koush/wrtc';
import { StreamMonitorService } from './stream-monitor.service';
import { SpaceRTCService } from './space-rtc.service';

type Role = 'human' | 'agent';

interface SignalMessage {
  type: string;
  spaceId: string;
  fromId: string;
  role: Role;
  data?: any; // For publishState, prefer { publishing: boolean } going forward
  targetId?: string;
  // Back-compat: some clients may still send combined publish object
  publish?: { audio: boolean; video: boolean };
  // Standardize stream type across the system
  streamType?: 'audio' | 'camera' | 'screen' | 'url';
}

interface PeerConnection {
  pc: any;
  targetId: string;
  streamType: 'audio' | 'camera' | 'screen' | 'url';
  isMonitoring: boolean;
  audioSink?: any;
  videoSink?: any;
}

interface AgentContext {
  socket: Socket;
  spaceId: string;
  agentId: string;
  peers: Map<string, PeerConnection>; // key: peerId-streamType
  monitoringSessions: Set<string>;
  isJoined: boolean;
}

@Injectable()
export class AiMediaBridgeService {
  private readonly logger = new Logger(AiMediaBridgeService.name);
  private contexts = new Map<string, AgentContext>(); // key: spaceId:agentId

  constructor(
    private readonly streamMonitor: StreamMonitorService,
    @Inject(forwardRef(() => SpaceRTCService))
    private readonly spaceRTCService: SpaceRTCService,
  ) {
    // Listen for screen share and web capture frames
    this.spaceRTCService.on('screenShareFrame', (frameData) => {
      this.handleNonWebRTCFrame(frameData);
    });

    this.spaceRTCService.on('webCaptureFrame', (frameData) => {
      this.handleNonWebRTCFrame(frameData);
    });
  }

  /**
   * Join space as agent - simplified
   */
  async joinSpaceAsAgent(
    spaceId: string,
    agentId: string,
    wsUrl: string,
    iceServers?: any[],
  ): Promise<void> {
    const key = `${spaceId}:${agentId}`;

    if (this.contexts.has(key)) {
      this.logger.log(`Agent ${agentId} already in space ${spaceId}`);
      return;
    }

    return new Promise((resolve, reject) => {
      const baseUrl = wsUrl.replace(/^wss?:\/\//, '').replace(/\/rtc$/, '');
      const protocol = wsUrl.startsWith('wss') ? 'https' : 'http';
      const fullUrl = `${protocol}://${baseUrl}`;

      const socket = io(`${fullUrl}/rtc`, {
        transports: ['websocket'],
        autoConnect: true,
      });

      const context: AgentContext = {
        socket,
        spaceId,
        agentId,
        peers: new Map(),
        monitoringSessions: new Set(),
        isJoined: false,
      };

      const timeout = setTimeout(() => {
        if (!context.isJoined) {
          socket.disconnect();
          reject(new Error('Join timeout'));
        }
      }, 10000);

      socket.on('connect', () => {
        this.logger.log(`Agent ${agentId} connected to ${fullUrl}/rtc`);
        socket.emit('join', { spaceId, fromId: agentId, role: 'agent' });
      });

      socket.on('joined', (data) => {
        clearTimeout(timeout);
        context.isJoined = true;
        this.contexts.set(key, context);

        this.logger.log(
          `Agent ${agentId} joined space ${spaceId} with ${data.participants?.length || 0} participants`,
        );

        // Set up signaling
        this.setupSignaling(context, iceServers);

        resolve();
      });

      socket.on('disconnect', () => {
        this.logger.log(`Agent ${agentId} disconnected from space ${spaceId}`);
        this.cleanup(context);
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Start monitoring - simplified
   */
  async startStreamMonitoring(
    spaceId: string,
    agentId: string,
    targetParticipantId?: string,
    wsUrl?: string,
    iceServers?: any[],
  ): Promise<string> {
    // Ensure agent is joined
    const key = `${spaceId}:${agentId}`;
    if (!this.contexts.has(key)) {
      const defaultWsUrl = wsUrl || this.getDefaultWebSocketUrl();
      await this.joinSpaceAsAgent(spaceId, agentId, defaultWsUrl, iceServers);

      // Wait for connection to stabilize
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const context = this.contexts.get(key)!;

    // Start monitoring session
    const sessionId = await this.streamMonitor.startMonitoring(
      spaceId,
      agentId,
      targetParticipantId,
    );

    context.monitoringSessions.add(sessionId);

    // Set up monitoring for existing peers
    await this.setupMonitoringForPeers(context, sessionId, targetParticipantId);

    this.logger.log(
      `Started monitoring session ${sessionId} for agent ${agentId}`,
    );
    return sessionId;
  }

  /**
   * Set up simplified signaling
   */
  private setupSignaling(context: AgentContext, iceServers?: any[]) {
    context.socket.on('signal', async (message: SignalMessage) => {
      try {
        switch (message.type) {
          case 'peer-joined':
            if (message.fromId !== context.agentId) {
              await this.handlePeerJoined(context, message.fromId, iceServers);
            }
            break;

          case 'publishState':
            if (message.fromId !== context.agentId) {
              // Prefer new schema: message.data?.publishing boolean
              const publishing: boolean | undefined =
                typeof message.data?.publishing === 'boolean'
                  ? message.data.publishing
                  : undefined;

              await this.handlePublishState(
                context,
                message.fromId,
                publishing,
                (message.streamType as any) || 'camera',
                iceServers,
                // Pass along legacy publish object for back-compat decisions
                message.publish,
              );
            }
            break;

          case 'offer':
            if (message.targetId === context.agentId) {
              await this.handleOffer(context, message);
            }
            break;

          case 'answer':
            if (message.targetId === context.agentId) {
              await this.handleAnswer(context, message);
            }
            break;

          case 'candidate':
            if (message.targetId === context.agentId) {
              await this.handleCandidate(context, message);
            }
            break;

          case 'peer-left':
            this.handlePeerLeft(context, message.fromId);
            break;
        }
      } catch (error) {
        this.logger.error(`Signal handling error: ${error}`);
      }
    });
  }

  /**
   * Handle peer joined - create connection if they're publishing
   */
  private async handlePeerJoined(
    context: AgentContext,
    peerId: string,
    iceServers?: any[],
  ) {
    this.logger.log(`Peer ${peerId} joined space ${context.spaceId}`);
    // Don't create connection yet - wait for publishState
  }

  /**
   * Handle publish state - create connection for publishing peers
   */
  private async handlePublishState(
    context: AgentContext,
    peerId: string,
    publishing: boolean | undefined,
    streamType: 'audio' | 'camera' | 'screen' | 'url',
    iceServers?: any[],
    legacyPublish?: { audio: boolean; video: boolean },
  ) {
    const connectionKey = `${peerId}-${streamType}`;

    // Handle different stream types
    if (streamType === 'camera') {
      // New schema: single boolean for camera publishing
      // Legacy: derive from combined publish object
      const isPublishing =
        typeof publishing === 'boolean'
          ? publishing
          : legacyPublish
            ? !!legacyPublish.video || !!legacyPublish.audio
            : false;

      this.logger.log(
        `Peer ${peerId} camera publish state: ${isPublishing} (legacy: ${legacyPublish ? `a=${legacyPublish.audio}, v=${legacyPublish.video}` : 'n/a'})`,
      );

      if (isPublishing && !context.peers.has(connectionKey)) {
        // Create peer connection for camera stream
        await this.createPeerConnection(
          context,
          peerId,
          'camera',
          iceServers,
          false,
        );
      } else if (!isPublishing && context.peers.has(connectionKey)) {
        // Clean up if they stopped publishing
        this.removePeerConnection(context, connectionKey);
      }
    } else if (streamType === 'screen') {
      this.logger.log(`Peer ${peerId} screen sharing state changed`);

      // For screen sharing, always try to create a connection
      if (!context.peers.has(connectionKey)) {
        await this.createPeerConnection(
          context,
          peerId,
          'screen',
          iceServers,
          false,
        );
      }
    } else if (streamType === 'audio') {
      // Allow audio-only connections if clients split streams
      const isPublishing =
        typeof publishing === 'boolean'
          ? publishing
          : legacyPublish
            ? !!legacyPublish.audio && !legacyPublish.video
            : false;

      this.logger.log(
        `Peer ${peerId} audio publish state: ${isPublishing} (legacy: ${legacyPublish ? `a=${legacyPublish.audio}, v=${legacyPublish.video}` : 'n/a'})`,
      );

      if (isPublishing && !context.peers.has(connectionKey)) {
        await this.createPeerConnection(
          context,
          peerId,
          'audio',
          iceServers,
          false,
        );
      } else if (!isPublishing && context.peers.has(connectionKey)) {
        this.removePeerConnection(context, connectionKey);
      }
    }
  }

  /**
   * Create peer connection - with controlled negotiation
   */
  private async createPeerConnection(
    context: AgentContext,
    peerId: string,
    streamType: 'audio' | 'camera' | 'screen' | 'url',
    iceServers?: any[],
    shouldCreateOffer = true,
  ) {
    const connectionKey = `${peerId}-${streamType}`;

    // Don't create if already exists
    if (context.peers.has(connectionKey)) {
      this.logger.warn(`Peer connection already exists for ${connectionKey}`);
      return;
    }

    const pc = new wrtc.RTCPeerConnection({
      iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const peer: PeerConnection = {
      pc,
      targetId: peerId,
      streamType,
      isMonitoring: false,
    };

    // Set up ICE candidate handling
    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        context.socket.emit('signal', {
          type: 'candidate',
          spaceId: context.spaceId,
          fromId: context.agentId,
          role: 'agent',
          targetId: peerId,
          data: event.candidate,
          streamType,
        });
      }
    };

    // Set up track handling for monitoring (modality-aware)
    pc.ontrack = (event: any) => {
      this.logger.log(
        `Received ${event.track?.kind || 'unknown'} track from ${peerId} (${streamType})`,
      );

      // Validate track presence only; wrtc may not populate event.streams
      if (!event.track) {
        this.logger.warn(`ontrack without a track from ${peerId}`);
        return;
      }

      // Enforce expected kind for this connection's streamType
      const expectedKind = streamType === 'audio' ? 'audio' : 'video';
      if (event.track.kind !== expectedKind) {
        this.logger.warn(
          `Ignoring unexpected ${event.track.kind} on ${streamType} connection for ${peerId}`,
        );
        return;
      }

      if (expectedKind === 'audio') {
        this.setupAudioTrackMonitoring(context, peer, event.track);
      } else {
        this.setupVideoTrackMonitoring(context, peer, event.track);
      }
    };

    // Add connection state logging
    pc.onconnectionstatechange = () => {
      this.logger.log(
        `Connection state with ${peerId} (${streamType}): ${pc.connectionState}`,
      );

      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected'
      ) {
        this.logger.warn(`Connection failed for ${connectionKey}, cleaning up`);
        setTimeout(
          () => this.removePeerConnection(context, connectionKey),
          1000,
        );
      }
    };

    pc.oniceconnectionstatechange = () => {
      this.logger.log(
        `ICE connection state with ${peerId} (${streamType}): ${pc.iceConnectionState}`,
      );
    };

    // Make receive intent explicit per modality to avoid coupling video to audio
    try {
      if (streamType === 'audio') {
        pc.addTransceiver('audio', { direction: 'recvonly' as any });
      } else if (streamType === 'camera' || streamType === 'screen') {
        pc.addTransceiver('video', { direction: 'recvonly' as any });
      }
    } catch (e) {
      this.logger.debug(`Transceiver add failed for ${connectionKey}: ${e}`);
    }

    context.peers.set(connectionKey, peer);

    // Only create offer if we should initiate
    if (shouldCreateOffer) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: streamType === 'audio',
          offerToReceiveVideo:
            streamType === 'camera' || streamType === 'screen',
        } as any);
        await pc.setLocalDescription(offer);

        context.socket.emit('signal', {
          type: 'offer',
          spaceId: context.spaceId,
          fromId: context.agentId,
          role: 'agent',
          targetId: peerId,
          data: offer,
          streamType,
        });

        this.logger.log(`Created offer for peer ${peerId} (${streamType})`);
      } catch (error) {
        this.logger.error(
          `Failed to create offer for ${peerId} (${streamType}): ${error}`,
        );
        this.removePeerConnection(context, connectionKey);
      }
    } else {
      this.logger.log(
        `Peer connection created for ${peerId} (${streamType}), waiting for offer`,
      );
    }
  }

  /**
   * Handle signaling messages - improved error handling
   */
  private async handleOffer(context: AgentContext, message: SignalMessage) {
    const streamType = (message.streamType as any) || 'camera';
    const connectionKey = `${message.fromId}-${streamType}`;
    let peer = context.peers.get(connectionKey);

    // If we don't have a peer connection, create one
    if (!peer) {
      await this.createPeerConnection(
        context,
        message.fromId,
        streamType as any,
        undefined,
        false,
      );
      peer = context.peers.get(connectionKey);
    }

    if (peer) {
      try {
        // Check current signaling state
        this.logger.log(
          `Peer ${message.fromId} (${streamType}) signaling state: ${peer.pc.signalingState}`,
        );

        if (
          peer.pc.signalingState === 'stable' ||
          peer.pc.signalingState === 'have-remote-offer'
        ) {
          await peer.pc.setRemoteDescription(message.data);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);

          context.socket.emit('signal', {
            type: 'answer',
            spaceId: context.spaceId,
            fromId: context.agentId,
            role: 'agent',
            targetId: message.fromId,
            data: answer,
            streamType,
          });

          this.logger.log(
            `Created answer for peer ${message.fromId} (${streamType})`,
          );
        } else {
          this.logger.warn(
            `Cannot handle offer from ${message.fromId} (${streamType}), signaling state: ${peer.pc.signalingState}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to handle offer from ${message.fromId} (${streamType}): ${error}`,
        );
      }
    }
  }

  private async handleAnswer(context: AgentContext, message: SignalMessage) {
    const streamType = (message.streamType as any) || 'camera';
    const connectionKey = `${message.fromId}-${streamType}`;
    const peer = context.peers.get(connectionKey);

    if (peer) {
      try {
        this.logger.log(
          `Setting remote answer for ${message.fromId} (${streamType}), signaling state: ${peer.pc.signalingState}`,
        );
        await peer.pc.setRemoteDescription(message.data);
      } catch (error) {
        this.logger.error(
          `Failed to set remote answer for ${message.fromId} (${streamType}): ${error}`,
        );
      }
    }
  }

  private async handleCandidate(context: AgentContext, message: SignalMessage) {
    const streamType = (message.streamType as any) || 'camera';
    const connectionKey = `${message.fromId}-${streamType}`;
    const peer = context.peers.get(connectionKey);

    if (peer) {
      try {
        // Only add ICE candidates if we have remote description
        if (peer.pc.remoteDescription) {
          await peer.pc.addIceCandidate(message.data);
        } else {
          this.logger.warn(
            `Ignoring ICE candidate from ${message.fromId} (${streamType}) - no remote description yet`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `ICE candidate failed for ${message.fromId} (${streamType}): ${error}`,
        );
      }
    }
  }

  private handlePeerLeft(context: AgentContext, peerId: string) {
    // Remove all connections for this peer
    const keysToRemove = Array.from(context.peers.keys()).filter((key) =>
      key.startsWith(`${peerId}-`),
    );

    keysToRemove.forEach((key) => {
      this.removePeerConnection(context, key);
    });
  }

  /**
   * Set up track monitoring for received media tracks - improved
   */
  private setupAudioTrackMonitoring(
    context: AgentContext,
    peer: PeerConnection,
    track: any,
  ) {
    this.logger.log(
      `Setting up audio track monitoring for ${peer.targetId} (${peer.streamType})`,
    );

    peer.isMonitoring = true;

    try {
      const audioSink = new (wrtc as any).nonstandard.RTCAudioSink(track);
      peer.audioSink = audioSink;

      audioSink.ondata = (data: any) => {
        setImmediate(() => {
          try {
            if (!data || !data.samples || data.samples.length === 0) return;
            context.monitoringSessions.forEach((sessionId) => {
              const wavBuffer = this.convertPCMToWAV(
                data.samples,
                data.sampleRate,
              );
              this.streamMonitor.pushAudioData(sessionId, wavBuffer, {
                format: 'wav',
              });
            });
          } catch (error) {
            this.logger.error(`Audio processing error: ${error}`);
          }
        });
      };

      this.logger.log(
        `Audio monitoring setup for peer ${peer.targetId} (${peer.streamType})`,
      );
    } catch (error) {
      this.logger.error(
        `Audio sink setup failed for ${peer.targetId} (${peer.streamType}): ${error}`,
      );
    }
  }

  private setupVideoTrackMonitoring(
    context: AgentContext,
    peer: PeerConnection,
    track: any,
  ) {
    this.logger.log(
      `Setting up video track monitoring for ${peer.targetId} (${peer.streamType})`,
    );

    peer.isMonitoring = true;

    try {
      const videoSink = new (wrtc as any).nonstandard.RTCVideoSink(track);
      peer.videoSink = videoSink;

      videoSink.onframe = (frame: any) => {
        setImmediate(() => {
          try {
            if (!frame) {
              this.logger.debug(
                `Received null/undefined frame from ${peer.targetId} (${peer.streamType})`,
              );
              return;
            }

            if (frame.frame && !frame.data) {
              frame = frame.frame;
            }

            if (
              typeof frame.width !== 'number' ||
              typeof frame.height !== 'number' ||
              frame.width <= 0 ||
              frame.height <= 0 ||
              !frame.data
            ) {
              this.logger.debug(
                `Skipping invalid video frame from ${peer.targetId} (${peer.streamType}): ` +
                  `width=${frame.width}, height=${frame.height}, ` +
                  `hasData=${!!frame.data}, frameKeys=[${Object.keys(frame).join(',')}]`,
              );
              return;
            }

            const bytesPerPixel =
              frame.data.length / (frame.width * frame.height);
            const expectedRGBALength = frame.width * frame.height * 4;

            if (frame.data.length !== expectedRGBALength) {
              const ratio = frame.data.length / expectedRGBALength;

              this.logger.debug(
                `Frame format adaptation: ${peer.targetId} (${peer.streamType}): ${bytesPerPixel.toFixed(2)} bytes/pixel, ` +
                  `size ratio: ${ratio.toFixed(3)}, ` +
                  `dimensions: ${frame.width}x${frame.height}, ` +
                  `received: ${frame.data.length} bytes, expected: ${expectedRGBALength} bytes, ` +
                  `frame format: ${frame.format || 'unknown'}`,
              );
            }

            const frameData = this.convertFrameFormat(frame, 'rgba');

            if (!frameData) {
              this.logger.debug(
                `Unable to convert frame data from ${peer.targetId} (${peer.streamType})`,
              );
              return;
            }

            this.logger.debug(
              `Forwarding video frame to StreamMonitor from ${peer.targetId} (${peer.streamType}) ` +
                `size=${frame.width}x${frame.height}, dataLength=${frameData.length}, sessions=${context.monitoringSessions.size}`,
            );

            context.monitoringSessions.forEach((sessionId) => {
              this.streamMonitor.pushVideoFrame(sessionId, {
                width: frame.width,
                height: frame.height,
                data: frameData,
                rotation: frame.rotation || 0,
                timestamp: Date.now(),
                participantId: peer.targetId,
                streamType:
                  peer.streamType === 'audio' ? undefined : peer.streamType,
              } as any);
            });
          } catch (error) {
            this.logger.error(`Video processing error: ${error}`);
          }
        });
      };

      this.logger.log(
        `Video monitoring setup for peer ${peer.targetId} (${peer.streamType})`,
      );
    } catch (error) {
      this.logger.error(
        `Video sink setup failed for ${peer.targetId} (${peer.streamType}): ${error}`,
      );
    }
  }

  /**
   * Handle frames from screen share or web capture (not via WebRTC)
   */
  private handleNonWebRTCFrame(frameInfo: {
    spaceId: string;
    participantId: string;
    frameData: Buffer;
    timestamp: number;
    streamType: 'screen' | 'url';
    sessionId?: string;
  }) {
    const { spaceId, participantId, frameData, timestamp, streamType } =
      frameInfo;

    // Find monitoring agents for this space
    this.contexts.forEach((context, key) => {
      if (context.spaceId === spaceId && context.isJoined) {
        // Check if this agent should monitor this participant
        const shouldMonitor = this.shouldMonitorParticipant(
          context,
          participantId,
        );

        if (shouldMonitor) {
          // Convert frame data to the format expected by stream monitor
          this.processFrameForMonitoring(context, {
            participantId,
            frameData,
            timestamp,
            streamType,
          });
        }
      }
    });
  }

  /**
   * Check if agent should monitor this participant's stream
   */
  private shouldMonitorParticipant(
    context: AgentContext,
    participantId: string,
  ): boolean {
    // Don't monitor self
    if (participantId === context.agentId) return false;

    // Check if we have active monitoring sessions
    if (context.monitoringSessions.size === 0) return false;

    // For now, monitor all active streams in the space
    // You could add more sophisticated filtering here
    return true;
  }

  /**
   * Process frame for monitoring (convert format and send to stream monitor)
   */
  private async processFrameForMonitoring(
    context: AgentContext,
    frameInfo: {
      participantId: string;
      frameData: Buffer;
      timestamp: number;
      streamType: 'camera' | 'screen' | 'url';
    },
  ) {
    try {
      // Convert JPEG buffer to RGBA format for stream monitor
      const imageData = await this.convertJPEGToRGBA(frameInfo.frameData);

      if (imageData) {
        // Send to all monitoring sessions for this agent
        context.monitoringSessions.forEach((sessionId) => {
          this.streamMonitor.pushVideoFrame(sessionId, {
            width: imageData.width,
            height: imageData.height,
            data: imageData.data,
            rotation: 0,
            timestamp: frameInfo.timestamp,
            participantId: frameInfo.participantId,
            streamType: frameInfo.streamType,
          });
        });

        this.logger.debug(
          `Processed ${frameInfo.streamType} frame from ${frameInfo.participantId} for agent ${context.agentId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process ${frameInfo.streamType} frame: ${error}`,
      );
    }
  }

  /**
   * Convert JPEG buffer to RGBA format
   */
  private async convertJPEGToRGBA(jpegBuffer: Buffer): Promise<{
    width: number;
    height: number;
    data: Uint8ClampedArray;
  } | null> {
    try {
      // Lazy load canvas
      if (!this.createCanvas) {
        const canvas = await import('canvas');
        this.createCanvas = canvas.createCanvas;
        this.loadImage = canvas.loadImage;
      }

      // Load the JPEG image
      const image = await this.loadImage(jpegBuffer);

      // Create canvas and get image data
      const canvas = this.createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, image.width, image.height);

      return {
        width: image.width,
        height: image.height,
        data: imageData.data,
      };
    } catch (error) {
      this.logger.error(`Failed to convert JPEG to RGBA: ${error}`);
      return null;
    }
  }

  /**
   * Update setupMonitoringForPeers to handle screen/web streams
   */
  private async setupMonitoringForPeers(
    context: AgentContext,
    sessionId: string,
    targetParticipantId?: string,
  ) {
    // Get active streams from RTC service (includes camera, screen, and url streams)
    const streams = this.spaceRTCService.getDetailedSpaceStreams(
      context.spaceId,
    );

    const activeStreams = streams.filter(
      (s) =>
        s.participant?.id !== context.agentId &&
        (!targetParticipantId || s.participant?.id === targetParticipantId),
    );

    this.logger.log(
      `Found ${activeStreams.length} active streams for monitoring (camera: ${activeStreams.filter((s) => s.streamType === 'camera').length}, screen: ${activeStreams.filter((s) => s.streamType === 'screen').length}, url: ${activeStreams.filter((s) => s.streamType === 'url').length})`,
    );

    // For WebRTC streams (camera and screen), request fresh publish states
    const webrtcStreams = activeStreams.filter(
      (s) => s.streamType === 'camera' || s.streamType === 'screen',
    );
    webrtcStreams.forEach((stream) => {
      if (stream.participant) {
        this.logger.log(
          `Requesting WebRTC connection with ${stream.participant.id} for ${stream.streamType}`,
        );
        context.socket.emit('signal', {
          type: 'requestPublishState',
          spaceId: context.spaceId,
          fromId: context.agentId,
          targetId: stream.participant.id,
          streamType: stream.streamType,
        });
      }
    });

    // For URL streams, monitoring is handled via events (no WebRTC setup needed)
    const urlStreams = activeStreams.filter((s) => s.streamType === 'url');
    if (urlStreams.length > 0) {
      this.logger.log(
        `Monitoring ${urlStreams.length} URL streams via event system`,
      );
    }
  }

  // Add loadImage property
  private loadImage: any;
  private createCanvas: any;

  /**
   * Helper function to convert between video frame formats
   * This will be useful for handling different frame formats from various clients
   */
  private convertFrameFormat(
    frame: {
      width: number;
      height: number;
      data: Uint8Array | Buffer | Uint8ClampedArray;
      format?: string;
    },
    targetFormat = 'rgba',
  ): Uint8ClampedArray | null {
    const { width, height, data } = frame;

    // Calculate bytes per pixel to help determine the source format
    const bytesPerPixel = data.length / (width * height);

    try {
      // RGBA is the target format we want (4 bytes per pixel)
      if (targetFormat === 'rgba') {
        const targetSize = width * height * 4;
        const output = new Uint8ClampedArray(targetSize);

        // Handle common formats
        if (Math.abs(bytesPerPixel - 4) < 0.1) {
          // Already RGBA format
          return new Uint8ClampedArray(
            data.buffer,
            data.byteOffset,
            data.byteLength,
          );
        } else if (Math.abs(bytesPerPixel - 3) < 0.1) {
          // RGB format (3 bytes per pixel)
          for (let i = 0; i < width * height; i++) {
            output[i * 4] = data[i * 3]; // R
            output[i * 4 + 1] = data[i * 3 + 1]; // G
            output[i * 4 + 2] = data[i * 3 + 2]; // B
            output[i * 4 + 3] = 255; // Alpha (fully opaque)
          }
          return output;
        } else if (Math.abs(bytesPerPixel - 1.5) < 0.1) {
          // YUV420/I420 format (1.5 bytes per pixel): Y plane, then U plane, then V plane
          this.logger.debug(
            `Converting I420 → RGBA for frame ${width}x${height}`,
          );

          const ySize = width * height;
          const uvWidth = width >> 1;
          const uvHeight = height >> 1;
          const uvSize = uvWidth * uvHeight;

          const buf = new Uint8Array(
            data.buffer,
            data.byteOffset,
            data.byteLength,
          );
          const yPlane = buf.subarray(0, ySize);
          const uPlane = buf.subarray(ySize, ySize + uvSize);
          const vPlane = buf.subarray(ySize + uvSize, ySize + uvSize + uvSize);

          let dst = 0;
          for (let y = 0; y < height; y++) {
            const yRow = y * width;
            const uvRow = (y >> 1) * uvWidth;
            for (let x = 0; x < width; x++) {
              const Y = yPlane[yRow + x];
              const uvIdx = uvRow + (x >> 1);
              const U = uPlane[uvIdx];
              const V = vPlane[uvIdx];

              // BT.601 full range conversion
              const C = Y - 16;
              const D = U - 128;
              const E = V - 128;

              let R = (298 * C + 409 * E + 128) >> 8;
              let G = (298 * C - 100 * D - 208 * E + 128) >> 8;
              let B = (298 * C + 516 * D + 128) >> 8;

              if (R < 0) R = 0;
              else if (R > 255) R = 255;
              if (G < 0) G = 0;
              else if (G > 255) G = 255;
              if (B < 0) B = 0;
              else if (B > 255) B = 255;

              output[dst++] = R;
              output[dst++] = G;
              output[dst++] = B;
              output[dst++] = 255;
            }
          }
          return output;
        } else if (Math.abs(bytesPerPixel - 1) < 0.1) {
          // Grayscale (1 byte per pixel)
          for (let i = 0; i < width * height; i++) {
            output[i * 4] = data[i]; // R
            output[i * 4 + 1] = data[i]; // G
            output[i * 4 + 2] = data[i]; // B
            output[i * 4 + 3] = 255; // Alpha
          }
          return output;
        } else {
          // Unknown format - create placeholder by using available data
          const copySize = Math.min(data.length, output.length);
          output.set(new Uint8Array(data.buffer, data.byteOffset, copySize));
          return output;
        }
      }

      // Add other target formats if needed in the future
      return null;
    } catch (error) {
      this.logger.error(`Frame format conversion error: ${error}`);
      return null;
    }
  }

  /**
   * Cleanup utilities
   */
  private removePeerConnection(context: AgentContext, connectionKey: string) {
    const peer = context.peers.get(connectionKey);
    if (peer) {
      if (peer.audioSink) {
        try {
          peer.audioSink.stop?.();
        } catch (e) {
          // Ignore errors when stopping
        }
        peer.audioSink = undefined;
      }
      if (peer.videoSink) {
        try {
          peer.videoSink.stop?.();
        } catch (e) {
          // Ignore errors when stopping
        }
        peer.videoSink = undefined;
      }
      peer.pc.close();
      context.peers.delete(connectionKey);
      this.logger.log(`Removed peer connection for ${connectionKey}`);
    }
  }

  private cleanup(context: AgentContext) {
    // Clean up all peer connections
    context.peers.forEach((peer, connectionKey) => {
      this.removePeerConnection(context, connectionKey);
    });

    // Stop monitoring sessions
    context.monitoringSessions.forEach((sessionId) => {
      this.streamMonitor.stopMonitoring(context.spaceId, context.agentId);
    });

    // Remove context
    const key = `${context.spaceId}:${context.agentId}`;
    this.contexts.delete(key);
  }

  /**
   * Public interface methods - maintain existing signatures
   */
  async stopStreamMonitoring(spaceId: string, agentId: string): Promise<void> {
    const key = `${spaceId}:${agentId}`;
    const context = this.contexts.get(key);

    if (context) {
      context.monitoringSessions.forEach((sessionId) => {
        this.streamMonitor.stopMonitoring(spaceId, agentId);
      });
      context.monitoringSessions.clear();
    }
  }

  leaveSpace(spaceId: string, agentId: string) {
    const key = `${spaceId}:${agentId}`;
    const context = this.contexts.get(key);

    if (context) {
      context.socket.disconnect();
      this.cleanup(context);
    }
  }

  // Maintain other existing method signatures...
  async startPublishingAudio(spaceId: string, agentId: string) {
    // Implementation for agent publishing (if needed)
  }

  stopPublishingAudio(spaceId: string, agentId: string) {
    // Implementation for agent publishing (if needed)
  }

  async startPublishingVideo(spaceId: string, agentId: string) {
    // Implementation for agent publishing (if needed)
  }

  stopPublishingVideo(spaceId: string, agentId: string) {
    // Implementation for agent publishing (if needed)
  }

  pushAudioFrame(
    spaceId: string,
    agentId: string,
    samples: Int16Array,
    sampleRate = 48000,
  ) {
    // Implementation for agent publishing (if needed)
  }

  pushVideoFrame(spaceId: string, agentId: string, frame: any) {
    // Implementation for agent publishing (if needed)
  }

  getActiveStreams(spaceId: string): any[] {
    return this.spaceRTCService.getDetailedSpaceStreams(spaceId);
  }

  getMonitoredStreams(spaceId: string): any[] {
    return this.streamMonitor.getActiveStreams(spaceId);
  }

  getSpaceParticipants(spaceId: string): any[] {
    const peers = this.spaceRTCService.getPeers(spaceId);
    return peers.map((peer) => ({
      id: peer.participantId,
      role: peer.role,
      publishing: peer.publish,
      screenSharing: peer.screenSharing || false,
      urlSharing: peer.urlSharing || { active: false },
    }));
  }

  getMonitoringStatus(): any {
    const status = {
      totalAgents: this.contexts.size,
      contexts: [] as any[],
    };

    this.contexts.forEach((context, key) => {
      status.contexts.push({
        key,
        spaceId: context.spaceId,
        agentId: context.agentId,
        isJoined: context.isJoined,
        peerCount: context.peers.size,
        monitoringSessionCount: context.monitoringSessions.size,
        peers: Array.from(context.peers.keys()),
      });
    });

    return {
      bridge: status,
      streamMonitor: this.streamMonitor.getMonitoringStatus(),
    };
  }

  private getDefaultWebSocketUrl(): string {
    const protocol = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
    const host = process.env.WS_HOST || 'localhost';
    const port = process.env.PORT || 3001;
    return `${protocol}://${host}:${port}/rtc`;
  }

  private convertPCMToWAV(samples: Int16Array, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const fileSize = 36 + dataSize;

    const buffer = Buffer.alloc(44 + dataSize);
    let offset = 0;

    // WAV header
    buffer.write('RIFF', offset);
    offset += 4;
    buffer.writeUInt32LE(fileSize, offset);
    offset += 4;
    buffer.write('WAVE', offset);
    offset += 4;
    buffer.write('fmt ', offset);
    offset += 4;
    buffer.writeUInt32LE(16, offset);
    offset += 4;
    buffer.writeUInt16LE(1, offset);
    offset += 2;
    buffer.writeUInt16LE(numChannels, offset);
    offset += 2;
    buffer.writeUInt32LE(sampleRate, offset);
    offset += 4;
    buffer.writeUInt32LE(byteRate, offset);
    offset += 4;
    buffer.writeUInt16LE(blockAlign, offset);
    offset += 2;
    buffer.writeUInt16LE(bitsPerSample, offset);
    offset += 2;
    buffer.write('data', offset);
    offset += 4;
    buffer.writeUInt32LE(dataSize, offset);
    offset += 4;

    // PCM data
    for (let i = 0; i < samples.length; i++) {
      buffer.writeInt16LE(samples[i], offset);
      offset += 2;
    }

    return buffer;
  }
}
