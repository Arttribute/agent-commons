// apps/commons-api/src/space/stream-monitor.service.ts
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { TranscriptionDeliveryService } from './transcription-delivery.service';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import WebSocket from 'ws';
import { WaveFile } from 'wavefile';
import { SpaceAgentTriggerService } from './space-agent-trigger.service';

// Only import canvas lazily when needed (faster cold start)
let createCanvas: any;

type AudioFormat = 'wav' | 'mp3' | 'ogg' | 'webm' | 'm4a'; // keep flexible; API accepts many

interface StreamTranscription {
  sessionId: string;
  spaceId: string;
  participantId: string;
  transcript: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
  audioLevel?: number;
  type?: 'audio' | 'video' | 'speech_event';
}

interface MonitoringSession {
  sessionId: string;
  spaceId: string;
  participantId: string;
  monitoringAgents: Set<string>;
  isActive: boolean;
  lastActivity: Date;

  // Simplified buffering for “near-realtime”:
  audioBuffer: Buffer[]; // rolling buffer of small audio chunks
  lastAudioFlushAt?: number; // ms
  audioFormat: AudioFormat; // what upstream sends us (prefer wav/webm)

  lastVideoFrameAt?: number; // ms
  pendingVision?: boolean; // avoid overlapping vision calls
  visionIntervalMs: number; // e.g. 3000–5000
  imageDetail: 'low' | 'high' | 'auto';

  // Backoff + rate-limit state
  consecutiveErrors: number;

  // Realtime (audio) session state
  rtSocket?: WebSocket; // OpenAI Realtime WebSocket
  rtReady?: boolean; // handshake done
  rtConnecting?: boolean; // avoid duplicate connects
  rtPendingText?: string; // accumulating partial transcript
  rtLastCommitAt?: number; // last time we committed buffer

  // Latest captured visual frame for downstream triggers
  lastFrameDataUrl?: string;
  lastFrameTimestamp?: number; // epoch ms
}

@Injectable()
export class StreamMonitorService extends EventEmitter {
  private readonly logger = new Logger(StreamMonitorService.name);
  private sessions = new Map<string, MonitoringSession>();
  private agentToSession = new Map<string, string>();

  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Realtime config
  private REALTIME_MODEL =
    process.env.REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';
  private USE_REALTIME =
    (process.env.USE_REALTIME || 'true').toLowerCase() !== 'false';
  private REALTIME_TRANSCRIBE_INSTRUCTIONS =
    'Transcribe the newly received audio. Return only the verbatim transcript (no timestamps, speaker tags, punctuation only where obvious).';

  // Tuning knobs
  private AUDIO_FLUSH_MS = 1000; // try flush every ~1s
  private AUDIO_MAX_CHUNK_BYTES = 1_000_000; // 1 MB safety
  private DEFAULT_VISION_INTERVAL_MS = 1000; // analyze ~every 2s
  private MAX_PARALLEL_VISION = 1;
  // Global override config (can be tuned at runtime)
  private visionConfig = {
    defaultIntervalMs: 1000,
    imageDetail: 'low' as 'low' | 'high' | 'auto',
  };

  constructor(
    @Inject(forwardRef(() => TranscriptionDeliveryService))
    private readonly delivery: TranscriptionDeliveryService,
    private readonly triggerService: SpaceAgentTriggerService,
  ) {
    super();
    if (!process.env.OPENAI_API_KEY) {
      this.logger.warn('OPENAI_API_KEY not set.');
    }
  }

  /** Start monitoring a stream (no realtime socket; just queues). */
  async startMonitoring(
    spaceId: string,
    agentId: string,
    targetParticipantId?: string,
  ): Promise<string> {
    // Create a unique session ID for this monitoring request
    const sessionId = `${spaceId}:${agentId}:${targetParticipantId || 'general'}:${Date.now()}`;

    const session: MonitoringSession = {
      sessionId,
      spaceId,
      participantId: targetParticipantId || 'general',
      monitoringAgents: new Set([agentId]),
      isActive: true,
      lastActivity: new Date(),
      audioBuffer: [],
      audioFormat: 'wav',
      visionIntervalMs: this.DEFAULT_VISION_INTERVAL_MS,
      imageDetail: this.visionConfig.imageDetail,
      consecutiveErrors: 0,
    };

    this.sessions.set(sessionId, session);
    this.agentToSession.set(agentId, sessionId);

    this.logger.log(
      `Agent ${agentId} started monitoring ${session.participantId} in ${spaceId} (session: ${sessionId})`,
    );

    // Initialize realtime socket lazily only when first audio chunk arrives to save resources.
    return sessionId;
  }

  async stopMonitoring(spaceId: string, agentId: string): Promise<void> {
    const sessionKey = this.agentToSession.get(agentId);
    if (!sessionKey) return;
    const session = this.sessions.get(sessionKey);
    if (!session) return;

    session.monitoringAgents.delete(agentId);
    this.agentToSession.delete(agentId);

    if (session.monitoringAgents.size === 0) {
      this.sessions.delete(sessionKey);
      this.logger.log(
        `Stopped session ${sessionKey} (no more monitoring agents).`,
      );
    } else {
      this.logger.log(
        `Agent ${agentId} left; ${session.monitoringAgents.size} remain for ${sessionKey}.`,
      );
    }
  }

  /** Receive small audio chunks (WAV/WEBM/etc). We buffer and flush roughly every second. */
  pushAudioData(
    sessionId: string,
    audioChunk: Buffer,
    opts?: { format?: AudioFormat },
  ) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return;

    if (opts?.format) session.audioFormat = opts.format;
    session.audioBuffer.push(audioChunk);

    const now = Date.now();
    const bytes = session.audioBuffer.reduce((n, b) => n + b.length, 0);
    const shouldFlushByTime =
      !session.lastAudioFlushAt ||
      now - session.lastAudioFlushAt >= this.AUDIO_FLUSH_MS;
    const shouldFlushBySize = bytes >= this.AUDIO_MAX_CHUNK_BYTES;

    if (shouldFlushByTime || shouldFlushBySize) {
      const payload = Buffer.concat(session.audioBuffer);
      session.audioBuffer = [];
      session.lastAudioFlushAt = now;
      if (this.USE_REALTIME) {
        this.streamAudioToRealtime(session, payload).catch((e) =>
          this.logger.error('streamAudioToRealtime error', e),
        );
      } else {
        this.transcribeChunk(session, payload).catch((e) =>
          this.logger.error('transcribeChunk error', e),
        );
      }
    }
  }

  /** Transcribe a buffered audio chunk via Audio Transcriptions API. */
  private async transcribeChunk(session: MonitoringSession, audio: Buffer) {
    if (audio.length === 0) return;

    try {
      // Write to a temp file (the Node SDK’s transcriptions API accepts file-like streams or toFile)
      const tmpPath = path.join(
        os.tmpdir(),
        `mon-${session.sessionId}-${Date.now()}.${session.audioFormat || 'wav'}`,
      );
      fs.writeFileSync(tmpPath, audio);

      // Choose your STT model: gpt-4o-mini-transcribe (fast) or whisper-1 (robust, larger)
      const sttModel = process.env.STT_MODEL || 'gpt-4o-mini-transcribe';

      const res = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpPath) as any,
        model: sttModel,
        // You can pass language if known: language: "en",
        // temperature: 0,
      });

      fs.unlink(tmpPath, () => {});

      const text = (res as any)?.text?.trim();
      if (text) {
        const transcription: StreamTranscription = {
          sessionId: session.sessionId,
          spaceId: session.spaceId,
          participantId: session.participantId,
          transcript: `[AUDIO] ${text}`,
          timestamp: Date.now(),
          confidence: 1.0, // API doesn’t return a confidence score; keep 1.0 or estimate
          isFinal: true,
          type: 'audio',
        };

        await this.delivery.broadcastTranscriptionToSpace(
          session.spaceId,
          transcription,
          Array.from(session.monitoringAgents),
        );

        session.lastActivity = new Date();
        session.consecutiveErrors = 0;
      }
    } catch (err) {
      session.consecutiveErrors++;
      this.logger.warn(
        `Transcription failed x${session.consecutiveErrors} for ${session.sessionId}`,
        err as any,
      );
    }
  }

  /** Stream an audio buffer to realtime: convert to 16k PCM16, append, commit, request transcription. */
  private async streamAudioToRealtime(
    session: MonitoringSession,
    audio: Buffer,
  ) {
    if (audio.length === 0) return;

    const ws = session.rtSocket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return; // will retry on next chunk

    try {
      // Decode WAV (or other) into PCM16 16k mono
      let pcm16: Int16Array | null = null;
      if (session.audioFormat === 'wav') {
        const wav = new WaveFile(audio);
        // WaveFile typings are loose; use any to access internals
        const wavAny: any = wav as any;
        let samplesRaw = wavAny.getSamples(false) as any; // could be Int16Array | Float32Array | number[]
        const sampleRate: number = wavAny.fmt?.sampleRate || 16000;
        // Normalize to Int16Array
        let samples: Int16Array;
        if (samplesRaw instanceof Int16Array) {
          samples = samplesRaw;
        } else if (samplesRaw instanceof Float32Array) {
          samples = new Int16Array(samplesRaw.length);
          for (let i = 0; i < samplesRaw.length; i++) {
            const v = Math.max(-1, Math.min(1, samplesRaw[i]));
            samples[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
          }
        } else if (Array.isArray(samplesRaw)) {
          samples = new Int16Array(samplesRaw.length);
          for (let i = 0; i < samplesRaw.length; i++)
            samples[i] = samplesRaw[i];
        } else {
          // Fallback: treat underlying buffer as Int16
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          samples = new Int16Array(samplesRaw.buffer || audio.buffer);
        }
        if (sampleRate !== 16000) {
          const ratio = sampleRate / 16000;
          const outLen = Math.floor(samples.length / ratio);
          const out = new Int16Array(outLen);
          for (let i = 0; i < outLen; i++)
            out[i] = samples[Math.floor(i * ratio)];
          pcm16 = out;
        } else {
          pcm16 = samples;
        }
      } else {
        // For non-wav formats, fall back to raw bytes (hope already PCM16 16k) - or skip
        pcm16 = new Int16Array(
          audio.buffer,
          audio.byteOffset,
          Math.floor(audio.length / 2),
        );
      }

      if (!pcm16 || pcm16.length === 0) return;
      const buf = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
      const b64 = buf.toString('base64');

      ws.send(
        JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }),
      );
      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      ws.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            instructions: this.REALTIME_TRANSCRIBE_INSTRUCTIONS,
            modalities: ['text'],
          },
        }),
      );
    } catch (err) {
      session.consecutiveErrors++;
      this.logger.warn(
        `streamAudioToRealtime failed x${session.consecutiveErrors} for ${session.sessionId}`,
        err as any,
      );
    }
  }

  private handleRealtimeMessage(session: MonitoringSession, msg: any) {
    // Examples of event types (subject to OpenAI realtime spec evolution):
    // response.output_text.delta, response.output_text.done, response.completed
    const t = msg.type;
    if (!t) return;
    switch (t) {
      case 'response.output_text.delta': {
        const d = msg.delta || msg.text || msg.content || '';
        if (!session.rtPendingText) session.rtPendingText = '';
        session.rtPendingText += d;
        break;
      }
      case 'response.output_text.done':
      case 'response.completed': {
        const finalText = (session.rtPendingText || '').trim();
        if (finalText) {
          const transcription: StreamTranscription = {
            sessionId: session.sessionId,
            spaceId: session.spaceId,
            participantId: session.participantId,
            transcript: `[AUDIO] ${finalText}`,
            timestamp: Date.now(),
            confidence: 1.0,
            isFinal: true,
            type: 'audio',
          };
          this.delivery.broadcastTranscriptionToSpace(
            session.spaceId,
            transcription,
            Array.from(session.monitoringAgents),
          );
        }
        session.rtPendingText = '';
        session.lastActivity = new Date();
        session.consecutiveErrors = 0;
        break;
      }
      case 'error': {
        session.consecutiveErrors++;
        this.logger.warn(
          `Realtime error for ${session.sessionId}: ${msg.error?.message || msg}`,
        );
        break;
      }
      default:
        // Silently ignore other event types for now
        break;
    }
  }

  /** Push a decoded video frame (RGBA) to be sampled → JPEG → vision prompt. */
  async pushVideoFrame(
    sessionId: string,
    frame: {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      rotation?: number;
      timestamp: number;
      participantId: string;
      streamType?: 'camera' | 'screen' | 'url'; // Add stream type
    },
  ) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return;

    // Validate frame data
    if (
      !frame.data ||
      frame.data.length === 0 ||
      frame.width <= 0 ||
      frame.height <= 0
    ) {
      this.logger.debug(
        `Skipping invalid video frame: width=${frame.width}, height=${frame.height}, dataLength=${frame.data?.length || 0}`,
      );
      return;
    }

    // Log receipt of frame for debugging
    this.logger.debug(
      `Received video frame for session=${sessionId}, participant=${frame.participantId}, ` +
        `type=${frame.streamType || 'camera'}, size=${frame.width}x${frame.height}, dataLength=${frame.data.length}`,
    );

    const now = Date.now();
    // sample every N ms and avoid overlap
    if (session.pendingVision) {
      this.logger.debug(
        `Skipping frame (pendingVision) for session=${sessionId}, participant=${frame.participantId}`,
      );
      return;
    }
    const effectiveInterval =
      session.visionIntervalMs ?? this.visionConfig.defaultIntervalMs;
    if (
      session.lastVideoFrameAt &&
      now - session.lastVideoFrameAt < effectiveInterval
    ) {
      this.logger.debug(
        `Throttling frame for session=${sessionId} (interval ${effectiveInterval}ms), delta=${now - session.lastVideoFrameAt}ms`,
      );
      return;
    }

    session.lastVideoFrameAt = now;
    session.pendingVision = true;

    try {
      // Lazy load canvas
      if (!createCanvas) {
        const canvas = await import('canvas');
        createCanvas = canvas.createCanvas;
      }

      // Convert RGBA → JPEG (downscale for cost if desired)
      const maxShortSide = 768;
      const scale = Math.min(
        1,
        frame.width < frame.height
          ? maxShortSide / frame.width
          : maxShortSide / frame.height,
      );
      const w = Math.round(frame.width * scale);
      const h = Math.round(frame.height * scale);

      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');

      // Draw original RGBA into a temporary canvas first if scaling
      const srcCanvas = createCanvas(frame.width, frame.height);
      const srcCtx = srcCanvas.getContext('2d');
      const imgData = srcCtx.createImageData(frame.width, frame.height);
      imgData.data.set(frame.data);
      srcCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(srcCanvas, 0, 0, w, h);

      const jpeg = canvas.toBuffer('image/jpeg', { quality: 0.7 });
      const b64 = jpeg.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${b64}`;

      // Persist latest frame for later trigger usage
      session.lastFrameDataUrl = dataUrl;
      session.lastFrameTimestamp = Date.now();

      this.logger.debug(
        `Processed video frame to JPEG for session=${sessionId}, output=${w}x${h}, bytes=${jpeg.length}`,
      );

      session.consecutiveErrors = 0;
    } catch (err) {
      session.consecutiveErrors++;
      this.logger.warn(
        `Vision analyze failed x${session.consecutiveErrors} for ${session.sessionId}`,
        err as any,
      );
    } finally {
      session.pendingVision = false;
    }
  }

  getMonitoringStatus() {
    const s: any = {
      totalSessions: this.sessions.size,
      activeSessions: 0,
      totalMonitoringAgents: 0,
      sessions: [] as any[],
    };
    this.sessions.forEach((session) => {
      if (session.isActive) s.activeSessions++;
      s.totalMonitoringAgents += session.monitoringAgents.size;
      s.sessions.push({
        sessionId: session.sessionId,
        spaceId: session.spaceId,
        participantId: session.participantId,
        isActive: session.isActive,
        monitoringAgentCount: session.monitoringAgents.size,
        lastActivity: session.lastActivity,
        hasAudioData: !!session.lastAudioFlushAt,
        lastAudioFlushAt: session.lastAudioFlushAt,
        lastVideoFrameAt: session.lastVideoFrameAt,
        pendingVision: session.pendingVision,
      });
    });
    return s;
  }

  /** Retrieve the most recent captured frame (data URL) for any active monitoring session in a space. */
  getLatestFrameDataForSpace(spaceId: string): {
    latestFrameUrl: string | undefined;
    sessionId: string | undefined;
  } {
    let latest: { ts: number; url: string; sessionId: string } | undefined;
    this.sessions.forEach((session) => {
      if (
        session.spaceId === spaceId &&
        session.isActive &&
        session.lastFrameDataUrl &&
        session.lastFrameTimestamp
      ) {
        if (!latest || session.lastFrameTimestamp > latest.ts) {
          latest = {
            ts: session.lastFrameTimestamp,
            url: session.lastFrameDataUrl,
            sessionId: session.sessionId,
          };
        }
      }
    });
    this.logger.debug(
      `getLatestFrameDataForSpace(${spaceId}) returning sessionId=${latest?.sessionId}, urlLength=${latest?.url?.length || 0}`,
    );
    return { latestFrameUrl: latest?.url, sessionId: latest?.sessionId };
  }

  getActiveStreams(spaceId: string): any[] {
    const rows: any[] = [];
    this.sessions.forEach((session) => {
      if (session.spaceId === spaceId && session.isActive) {
        rows.push({
          sessionId: session.sessionId,
          participantId: session.participantId,
          monitoringAgents: Array.from(session.monitoringAgents),
          lastActivity: session.lastActivity,
          isTranscribing: !!session.lastAudioFlushAt,
        });
      }
    });
    return rows;
  }

  getMonitoringAgents(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session ? Array.from(session.monitoringAgents) : [];
  }

  isAgentMonitoring(agentId: string): boolean {
    return this.agentToSession.has(agentId);
  }

  getSessionDetails(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: 'Session not found' };
    return {
      sessionId: session.sessionId,
      spaceId: session.spaceId,
      participantId: session.participantId,
      isActive: session.isActive,
      monitoringAgents: Array.from(session.monitoringAgents),
      lastActivity: session.lastActivity,
      lastAudioFlushAt: session.lastAudioFlushAt,
      lastVideoFrameAt: session.lastVideoFrameAt,
      pendingVision: session.pendingVision,
      audioFormat: session.audioFormat,
      visionIntervalMs: session.visionIntervalMs,
      imageDetail: session.imageDetail,
    };
  }
}
