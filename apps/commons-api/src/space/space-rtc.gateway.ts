import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { StreamMonitorService, StreamKind } from './stream-monitor.service';
import { SpaceSpeechService } from './space-speech.service';
import { WebCaptureService } from './web-capture.service';

interface SocketContext {
  spaceId: string;
  participantId: string;
  participantType: 'agent' | 'human';
}

@WebSocketGateway({ namespace: '/space-rtc', cors: { origin: '*' } })
export class SpaceRtcGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(SpaceRtcGateway.name);
  private readonly clientCtx = new Map<string, SocketContext>();

  constructor(
    private readonly monitor: StreamMonitorService,
    private readonly emitter: EventEmitter,
    private readonly webCapture: WebCaptureService,
    private readonly speech: SpaceSpeechService,
  ) {
    // Relay composite frame events
    this.emitter.on('stream.monitor.composite', (evt: any) => {
      this.server.to(evt.spaceId).emit('composite_frame', evt);
    });
    // Relay audio state events
    this.emitter.on('stream.monitor.audio_state', (evt: any) => {
      this.server.to(evt.spaceId).emit('audio_state', evt);
    });

    // Bridge web capture frames into monitor + broadcast incremental web frames
    this.webCapture.on('frame', (evt: any) => {
      try {
        if (!evt?.spaceId || !evt?.participantId || !evt?.frameData) return;
        // Update monitor state (kind = 'web')
        const b64 = Buffer.isBuffer(evt.frameData)
          ? evt.frameData.toString('base64')
          : (evt.frameData as string);
        this.monitor.addOrUpdateVideoFrame({
          spaceId: evt.spaceId,
          participantId: evt.participantId,
          participantType: 'human', // server capture attributed to initiating human by default
          kind: 'web',
          frameBase64: `data:image/jpeg;base64,${b64}`,
        });
        // Emit raw frame to clients for immediate view (optional; composite still generated separately)
        this.server.to(evt.spaceId).emit('web_capture_frame', {
          participantId: evt.participantId,
          frame: `data:image/jpeg;base64,${b64}`,
          ts: evt.timestamp || Date.now(),
        });
      } catch (e) {
        this.logger.debug(`web capture frame bridge error: ${String(e)}`);
      }
    });

    // Relay transcriptions to clients in the same space
    this.emitter.on('space.transcription.created', (evt: any) => {
      try {
        if (!evt?.spaceId) return;
        this.server.to(evt.spaceId).emit('transcription', evt);
      } catch (e) {
        this.logger.debug(`transcription relay error: ${String(e)}`);
      }
    });
  }

  afterInit() {
    this.logger.log('SpaceRtcGateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const ctx = this.clientCtx.get(client.id);
    if (ctx) {
      this.monitor.removeParticipant(ctx.spaceId, ctx.participantId);
      this.server.to(ctx.spaceId).emit('participant_left', {
        participantId: ctx.participantId,
      });
      this.clientCtx.delete(client.id);
    }
    this.logger.debug(`Client disconnected ${client.id}`);
  }

  /* ─────────────────────────  EVENTS  ───────────────────────── */

  @SubscribeMessage('join_space')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      spaceId: string;
      participantId: string;
      participantType?: 'agent' | 'human';
    },
  ) {
    if (!body.spaceId || !body.participantId)
      return { error: 'spaceId and participantId required' };
    const participantType = body.participantType || 'human';
    client.join(body.spaceId);
    this.clientCtx.set(client.id, {
      spaceId: body.spaceId,
      participantId: body.participantId,
      participantType,
    });
    // Ensure space exists
    this.monitor.ensureSpace(body.spaceId);
    this.server.to(body.spaceId).emit('participant_joined', {
      participantId: body.participantId,
      participantType,
    });
    return { success: true };
  }

  @SubscribeMessage('leave_space')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { spaceId?: string },
  ) {
    const ctx = this.clientCtx.get(client.id);
    if (!ctx) return { error: 'not joined' };
    client.leave(ctx.spaceId);
    this.monitor.removeParticipant(ctx.spaceId, ctx.participantId);
    this.server.to(ctx.spaceId).emit('participant_left', {
      participantId: ctx.participantId,
    });
    this.clientCtx.delete(client.id);
    return { success: true };
  }

  @SubscribeMessage('video_frame')
  handleVideoFrame(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      spaceId?: string;
      participantId?: string;
      participantType?: 'agent' | 'human';
      kind: StreamKind;
      frame: string; // base64 (may include data URL)
      width?: number;
      height?: number;
    },
  ) {
    const ctx = this.ensureCtx(client, body);
    if (!ctx) return { error: 'join first' };
    if (!body.kind || !body.frame) return { error: 'missing kind/frame' };
    this.monitor.addOrUpdateVideoFrame({
      spaceId: ctx.spaceId,
      participantId: ctx.participantId,
      participantType: ctx.participantType,
      kind: body.kind,
      frameBase64: body.frame,
      width: body.width,
      height: body.height,
    });
    return { success: true };
  }

  @SubscribeMessage('audio_chunk')
  handleAudioChunk(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      spaceId?: string;
      participantId?: string;
      participantType?: 'agent' | 'human';
      audio: string; // base64 PCM16LE mono
      sampleRate?: number;
      channels?: number;
    },
  ) {
    const ctx = this.ensureCtx(client, body);
    if (!ctx) return { error: 'join first' };
    if (!body.audio) return { error: 'missing audio' };
    this.monitor.addOrUpdateAudioChunk({
      spaceId: ctx.spaceId,
      participantId: ctx.participantId,
      participantType: ctx.participantType,
      audioBase64: body.audio,
      sampleRate: body.sampleRate,
      channels: body.channels,
    });
    // Also feed speech segmentation/transcription
    this.speech
      .ingestAudioChunk({
        spaceId: ctx.spaceId,
        participantId: ctx.participantId,
        participantType: ctx.participantType,
        audioBase64: body.audio,
        sampleRate: body.sampleRate,
        channels: body.channels,
      })
      .catch((e) => this.logger.debug(`speech ingest error: ${String(e)}`));
    return { success: true };
  }

  // Accept a full utterance as base64 audio for higher quality transcription
  @SubscribeMessage('audio_utterance')
  async handleAudioUtterance(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      spaceId?: string;
      participantId?: string;
      audio: string; // base64, may include data URL
      mime?: string; // e.g., 'audio/wav' | 'audio/webm'
      fileName?: string;
      model?: string;
    },
  ) {
    const ctx = this.ensureCtx(client, body);
    if (!ctx) return { error: 'join first' };
    if (!body.audio) return { error: 'missing audio' };
    await this.speech.transcribeUtteranceFromBase64({
      spaceId: ctx.spaceId,
      participantId: ctx.participantId,
      base64Audio: body.audio,
      mime: body.mime,
      fileName: body.fileName,
      model: body.model as any,
    });
    return { success: true };
  }

  @SubscribeMessage('request_composite')
  async handleRequestComposite(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { spaceId?: string },
  ) {
    const ctx = this.ensureCtx(client, body);
    if (!ctx) return { error: 'join first' };
    await this.monitor.forceComposite(ctx.spaceId);
    const latest = this.monitor.getLatestFrameDataForSpace(ctx.spaceId);
    return { success: true, ...latest };
  }

  // Agent-side publication from server (optional mirror for tooling)
  @SubscribeMessage('agent_publish_frame')
  agentPublishFrame(
    @MessageBody()
    body: {
      spaceId: string;
      agentId: string;
      kind: StreamKind;
      frame: string;
    },
  ) {
    this.monitor.publishAgentFrame({
      spaceId: body.spaceId,
      agentId: body.agentId,
      kind: body.kind,
      frameBase64: body.frame,
    });
    return { success: true };
  }

  @SubscribeMessage('agent_publish_audio')
  agentPublishAudio(
    @MessageBody()
    body: {
      spaceId: string;
      agentId: string;
      audio: string;
    },
  ) {
    this.monitor.publishAgentAudio({
      spaceId: body.spaceId,
      agentId: body.agentId,
      audioBase64: body.audio,
    });
    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong');
  }

  /* ────────────────  WEB CAPTURE CONTROL  ──────────────── */
  @SubscribeMessage('start_web_capture')
  async handleStartWebCapture(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { spaceId?: string; participantId?: string; url?: string },
  ) {
    const ctx = this.ensureCtx(client, body);
    if (!ctx) return { error: 'join first' };
    if (!body.url) return { error: 'url required' };
    const sessionId = `${ctx.spaceId}-${ctx.participantId}`; // deterministic single session per participant
    const resp = await this.webCapture.startCapture({
      sessionId,
      spaceId: ctx.spaceId,
      url: body.url,
      participantId: ctx.participantId,
    });
    if (!resp.success) return { error: resp.error || 'failed to start' };
    this.server.to(ctx.spaceId).emit('web_capture_started', {
      participantId: ctx.participantId,
      url: body.url,
    });
    return { success: true };
  }

  @SubscribeMessage('stop_web_capture')
  async handleStopWebCapture(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { spaceId?: string; participantId?: string },
  ) {
    const ctx = this.ensureCtx(client, body);
    if (!ctx) return { error: 'join first' };
    const sessionId = `${ctx.spaceId}-${ctx.participantId}`;
    await this.webCapture.stopCapture(sessionId);
    this.server.to(ctx.spaceId).emit('web_capture_stopped', {
      participantId: ctx.participantId,
    });
    return { success: true };
  }

  // Graceful end: announce ending, allow clients to transition UI, then stop.
  @SubscribeMessage('end_web_capture')
  async handleEndWebCapture(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { spaceId?: string; participantId?: string; delayMs?: number },
  ) {
    const ctx = this.ensureCtx(client, body);
    if (!ctx) return { error: 'join first' };
    const sessionId = `${ctx.spaceId}-${ctx.participantId}`;
    const delay = Math.min(Math.max(body.delayMs ?? 1500, 300), 5000); // clamp 300-5000ms
    this.server.to(ctx.spaceId).emit('web_capture_ending', {
      participantId: ctx.participantId,
      in: delay,
    });
    setTimeout(async () => {
      await this.webCapture.stopCapture(sessionId);
      this.server.to(ctx.spaceId).emit('web_capture_stopped', {
        participantId: ctx.participantId,
      });
    }, delay);
    return { success: true, delay };
  }

  /* ─────────────────────────  HELPERS  ───────────────────────── */
  private ensureCtx(client: Socket, body: any) {
    let ctx = this.clientCtx.get(client.id);
    if (!ctx && body?.spaceId && body?.participantId) {
      // allow context via payload if direct events before explicit join (fallback)
      ctx = {
        spaceId: body.spaceId,
        participantId: body.participantId,
        participantType: body.participantType || 'human',
      };
      this.clientCtx.set(client.id, ctx);
      client.join(ctx.spaceId);
    }
    return ctx;
  }
}
