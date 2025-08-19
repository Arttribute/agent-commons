import { Injectable, Logger } from '@nestjs/common';
import WebSocket from 'ws';
// @ts-ignore
import wrtc from '@koush/wrtc';

type Role = 'human' | 'agent';
type SignalType =
  | 'join'
  | 'leave'
  | 'offer'
  | 'answer'
  | 'candidate'
  | 'publishState'
  | 'mute'
  | 'unmute';

interface SignalMessage {
  type: SignalType;
  spaceId: string;
  fromId: string;
  role: Role;
  sdp?: any;
  candidate?: any;
  targetId?: string;
  publish?: { audio: boolean; video: boolean };
  mute?: { audio?: boolean; video?: boolean };
  streams?: any[];
  peers?: any[];
}

type PeerId = string;

interface PeerState {
  pc: any;
  targetId: string;
  remoteAudioSink?: wrtc.nonstandard.RTCAudioSink;
  remoteVideoSink?: wrtc.nonstandard.RTCVideoSink;
}

interface JoinContext {
  ws: WebSocket;
  spaceId: string;
  selfId: string;
  role: Role;
  peers: Map<PeerId, PeerState>;
  // local sources
  audioSource?: wrtc.nonstandard.RTCAudioSource;
  audioTrack?: any;
  videoSource?: wrtc.nonstandard.RTCVideoSource;
  videoTrack?: any;
  publishing: { audio: boolean; video: boolean };
}

@Injectable()
export class AiMediaBridgeService {
  private readonly logger = new Logger(AiMediaBridgeService.name);
  private joins = new Map<string, JoinContext>(); // key = spaceId:agentId

  /**
   * Agent joins a space's media bus (signaling + WebRTC)
   */
  async joinSpaceAsAgent(
    spaceId: string,
    agentId: string,
    wsUrl: string,
    iceServers?: any[],
  ) {
    const key = `${spaceId}:${agentId}`;
    if (this.joins.has(key)) {
      this.logger.log(`Agent ${agentId} already joined space ${spaceId}`);
      return;
    }

    const ws = new WebSocket(wsUrl);
    const ctx: JoinContext = {
      ws,
      spaceId,
      selfId: agentId,
      role: 'agent',
      peers: new Map(),
      publishing: { audio: false, video: false },
    };
    this.joins.set(key, ctx);

    const send = (msg: SignalMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.on('open', () => {
      const msg: SignalMessage = {
        type: 'join',
        spaceId,
        fromId: agentId,
        role: 'agent',
      };
      send(msg);
    });

    ws.on('message', async (raw) => {
      let msg: SignalMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.spaceId !== spaceId) return;

      switch (msg.type) {
        case 'join': {
          if (msg.fromId === agentId) {
            this.logger.log(`Agent ${agentId} joined space ${spaceId}`);
            // Connect to currently publishing peers
            (msg.streams || []).forEach((s: any) => {
              if ((s.publish?.audio || s.publish?.video) && s.id !== agentId) {
                this.dialPeer(ctx, s.id, iceServers);
              }
            });
          }
          break;
        }
        case 'publishState': {
          if (msg.fromId === agentId) break;
          // If a peer starts publishing, connect if not already
          if (
            (msg.publish?.audio || msg.publish?.video) &&
            !ctx.peers.has(msg.fromId)
          ) {
            this.dialPeer(ctx, msg.fromId, iceServers);
          }
          break;
        }
        case 'offer': {
          if (msg.targetId !== agentId) break;
          // create (or get) pc for this peer
          const ps = this.getOrCreatePC(ctx, msg.fromId, iceServers);
          await ps.pc.setRemoteDescription(msg.sdp);
          const ans = await ps.pc.createAnswer();
          await ps.pc.setLocalDescription(ans);
          send({
            type: 'answer',
            spaceId,
            fromId: agentId,
            role: 'agent',
            targetId: msg.fromId,
            sdp: ps.pc.localDescription,
          });
          break;
        }
        case 'answer': {
          if (msg.targetId !== agentId) break;
          // complete dial handshake
          const ps = ctx.peers.get(msg.fromId);
          if (ps) {
            await ps.pc.setRemoteDescription(msg.sdp);
          }
          break;
        }
        case 'candidate': {
          if (msg.targetId !== agentId) break;
          const ps = this.getOrCreatePC(ctx, msg.fromId, iceServers);
          try {
            await ps.pc.addIceCandidate(msg.candidate);
          } catch (e) {
            this.logger.error(`addIceCandidate failed: ${e}`);
          }
          break;
        }
        case 'leave': {
          // tear down peer
          const ps = ctx.peers.get(msg.fromId);
          if (ps) {
            ps.pc.close();
            ctx.peers.delete(msg.fromId);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      this.logger.log(`WS closed for ${key}`);
      this.leaveSpace(spaceId, agentId);
    });

    ws.on('error', (err) => {
      this.logger.error(`WS error for ${key}: ${err}`);
    });
  }

  /**
   * Agent leaves space (close all PCs, stop streams)
   */
  leaveSpace(spaceId: string, agentId: string) {
    const key = `${spaceId}:${agentId}`;
    const ctx = this.joins.get(key);
    if (!ctx) return;
    try {
      ctx.peers.forEach((ps) => ps.pc.close());
      ctx.peers.clear();
      ctx.ws?.close();
    } finally {
      this.joins.delete(key);
    }
  }

  /**
   * Start publishing audio (e.g., from TTS or any PCM source) — 48kHz mono PCM frames
   */
  async startPublishingAudio(spaceId: string, agentId: string) {
    const ctx = this.ensureCtx(spaceId, agentId);
    if (ctx.publishing.audio) return;

    const audioSource = new wrtc.nonstandard.RTCAudioSource();
    const audioTrack = audioSource.createTrack();
    ctx.audioSource = audioSource;
    ctx.audioTrack = audioTrack;
    ctx.publishing.audio = true;

    // Add track to all existing PCs
    ctx.peers.forEach((ps) => {
      ps.pc.addTrack(audioTrack);
      // renegotiate
      this.renegotiateOffer(ctx, ps);
    });

    // Notify others
    this.announcePublishState(ctx);
  }

  /**
   * Push one PCM frame into the audio source
   * samples: Int16Array PCM, sampleRate: 48000, channelCount:1
   */
  pushAudioFrame(
    spaceId: string,
    agentId: string,
    samples: Int16Array,
    sampleRate = 48000,
  ) {
    const ctx = this.ensureCtx(spaceId, agentId);
    if (!ctx.audioSource) return;
    ctx.audioSource.onData({
      samples,
      sampleRate,
      bitsPerSample: 16,
      channelCount: 1,
      numberOfFrames: samples.length,
    });
  }

  /**
   * Stop publishing audio
   */
  stopPublishingAudio(spaceId: string, agentId: string) {
    const ctx = this.ensureCtx(spaceId, agentId);
    if (!ctx.publishing.audio) return;
    ctx.publishing.audio = false;

    if (ctx.audioTrack) {
      ctx.audioTrack.stop();
      ctx.audioTrack = undefined as any;
    }
    ctx.audioSource = undefined as any;

    // Remove from senders + renegotiate
    ctx.peers.forEach((ps) => {
      ps.pc.getSenders().forEach((s: any) => {
        if (s.track && s.track.kind === 'audio') {
          ps.pc.removeTrack(s);
        }
      });
      this.renegotiateOffer(ctx, ps);
    });

    this.announcePublishState(ctx);
  }

  /**
   * Start publishing a synthetic video (or programmatic frames)
   * You can pipe frames into videoSource.onFrame(...)
   */
  async startPublishingVideo(spaceId: string, agentId: string) {
    const ctx = this.ensureCtx(spaceId, agentId);
    if (ctx.publishing.video) return;

    const videoSource = new wrtc.nonstandard.RTCVideoSource();
    const videoTrack = videoSource.createTrack();
    ctx.videoSource = videoSource;
    ctx.videoTrack = videoTrack;
    ctx.publishing.video = true;

    ctx.peers.forEach((ps) => {
      ps.pc.addTrack(videoTrack);
      this.renegotiateOffer(ctx, ps);
    });

    this.announcePublishState(ctx);
  }

  /**
   * Push one video frame in I420 format
   * frame: { width, height, data: I420 planes }
   */
  pushVideoFrame(spaceId: string, agentId: string, frame: any) {
    const ctx = this.ensureCtx(spaceId, agentId);
    if (!ctx.videoSource) return;
    ctx.videoSource.onFrame(frame);
  }

  stopPublishingVideo(spaceId: string, agentId: string) {
    const ctx = this.ensureCtx(spaceId, agentId);
    if (!ctx.publishing.video) return;
    ctx.publishing.video = false;

    if (ctx.videoTrack) {
      ctx.videoTrack.stop();
      ctx.videoTrack = undefined as any;
    }
    ctx.videoSource = undefined as any;

    ctx.peers.forEach((ps) => {
      ps.pc.getSenders().forEach((s: any) => {
        if (s.track && s.track.kind === 'video') {
          ps.pc.removeTrack(s);
        }
      });
      this.renegotiateOffer(ctx, ps);
    });

    this.announcePublishState(ctx);
  }

  /**
   * Register handlers to receive remote audio/video samples
   * Use this to run STT on audio; CV on video.
   */
  onRemoteAudio(
    spaceId: string,
    agentId: string,
    peerId: string,
    handler: (pcm: Int16Array, sampleRate: number) => void,
  ) {
    const ctx = this.ensureCtx(spaceId, agentId);
    const ps = ctx.peers.get(peerId);
    if (!ps) return;
    // reattach sink:
    if (!ps.remoteAudioSink) {
      // @ts-ignore
      ps.remoteAudioSink = new wrtc.nonstandard.RTCAudioSink(ps.pc as any); // sink attaches per track through 'ontrack' path below
    }
    // Actually, wrtc recommends attaching sink when the track is known on ontrack.
    // We'll set a flag; see ontrack below (we call handler from there).
    // For simplicity, we store handler on peer state:
    // @ts-ignore add property
    (ps as any)._audioHandler = handler;
  }

  onRemoteVideo(
    spaceId: string,
    agentId: string,
    peerId: string,
    handler: (frame: any) => void,
  ) {
    const ctx = this.ensureCtx(spaceId, agentId);
    const ps = ctx.peers.get(peerId);
    if (!ps) return;
    // @ts-ignore
    (ps as any)._videoHandler = handler;
  }

  /* ───────────── private helpers ───────────── */

  private ensureCtx(spaceId: string, agentId: string): JoinContext {
    const key = `${spaceId}:${agentId}`;
    const ctx = this.joins.get(key);
    if (!ctx) throw new Error(`Agent ${agentId} not joined space ${spaceId}`);
    return ctx;
  }

  private announcePublishState(ctx: JoinContext) {
    const msg: SignalMessage = {
      type: 'publishState',
      spaceId: ctx.spaceId,
      fromId: ctx.selfId,
      role: ctx.role,
      publish: { ...ctx.publishing },
    };
    if (ctx.ws.readyState === ctx.ws.OPEN) {
      ctx.ws.send(JSON.stringify(msg));
    }
  }

  private dialPeer(ctx: JoinContext, targetId: string, iceServers?: any[]) {
    const ps = this.getOrCreatePC(ctx, targetId, iceServers);
    ps.pc
      .createOffer()
      .then((offer: any) => ps.pc.setLocalDescription(offer))
      .then(() => {
        const msg: SignalMessage = {
          type: 'offer',
          spaceId: ctx.spaceId,
          fromId: ctx.selfId,
          role: ctx.role,
          targetId,
          sdp: ps.pc.localDescription,
        };
        if (ctx.ws.readyState === ctx.ws.OPEN) ctx.ws.send(JSON.stringify(msg));
      });
  }

  private renegotiateOffer(ctx: JoinContext, ps: PeerState) {
    ps.pc
      .createOffer()
      .then((offer: any) => ps.pc.setLocalDescription(offer))
      .then(() => {
        const msg: SignalMessage = {
          type: 'offer',
          spaceId: ctx.spaceId,
          fromId: ctx.selfId,
          role: ctx.role,
          targetId: ps.targetId,
          sdp: ps.pc.localDescription,
        };
        if (ctx.ws.readyState === ctx.ws.OPEN) ctx.ws.send(JSON.stringify(msg));
      })
      .catch((e: any) => this.logger.error(`renegotiateOffer error: ${e}`));
  }

  private getOrCreatePC(
    ctx: JoinContext,
    targetId: string,
    iceServers?: any[],
  ): PeerState {
    let ps = ctx.peers.get(targetId);
    if (ps) return ps;

    const pc = new wrtc.RTCPeerConnection({
      iceServers: iceServers ?? [{ urls: ['stun:stun.l.google.com:19302'] }],
    });

    pc.onicecandidate = (e: any) => {
      if (e.candidate && ctx.ws.readyState === ctx.ws.OPEN) {
        const msg: SignalMessage = {
          type: 'candidate',
          spaceId: ctx.spaceId,
          fromId: ctx.selfId,
          role: ctx.role,
          targetId,
          candidate: e.candidate,
        };
        ctx.ws.send(JSON.stringify(msg));
      }
    };

    // Attach local sources if publishing
    if (ctx.audioTrack) pc.addTrack(ctx.audioTrack);
    if (ctx.videoTrack) pc.addTrack(ctx.videoTrack);

    pc.ontrack = (ev: any) => {
      // Audio tracks: create sink and pipe PCM to handler
      ev.streams?.forEach((stream: any) => {
        stream.getAudioTracks().forEach((track: any) => {
          // @ts-ignore
          const sink = new wrtc.nonstandard.RTCAudioSink(track);
          // @ts-ignore
          sink.ondata = (data: { samples: Int16Array; sampleRate: number }) => {
            const h = (ctx.peers.get(targetId) as any)?._audioHandler;
            if (h) h(data.samples, data.sampleRate);
          };
        });
        stream.getVideoTracks().forEach((track: any) => {
          // @ts-ignore
          const vSink = new wrtc.nonstandard.RTCVideoSink(track);
          vSink.onframe = (frame: any) => {
            const h = (ctx.peers.get(targetId) as any)?._videoHandler;
            if (h) h(frame);
          };
          ps!.remoteVideoSink = vSink;
        });
      });
    };

    ps = { pc, targetId };
    ctx.peers.set(targetId, ps);
    return ps;
  }
}
