// apps/commons-api/src/space/stream-monitor.service.ts
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { TranscriptionDeliveryService } from './transcription-delivery.service';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
}

@Injectable()
export class StreamMonitorService extends EventEmitter {
  private readonly logger = new Logger(StreamMonitorService.name);
  private sessions = new Map<string, MonitoringSession>();
  private agentToSession = new Map<string, string>();

  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Tuning knobs
  private AUDIO_FLUSH_MS = 1000; // try flush every ~1s
  private AUDIO_MAX_CHUNK_BYTES = 1_000_000; // 1 MB safety
  private DEFAULT_VISION_INTERVAL_MS = 4000; // analyze ~every 4s
  private MAX_PARALLEL_VISION = 1;

  constructor(
    @Inject(forwardRef(() => TranscriptionDeliveryService))
    private readonly delivery: TranscriptionDeliveryService,
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
      imageDetail: 'low',
      consecutiveErrors: 0,
    };

    this.sessions.set(sessionId, session);
    this.agentToSession.set(agentId, sessionId);

    this.logger.log(
      `Agent ${agentId} started monitoring ${session.participantId} in ${spaceId} (session: ${sessionId})`,
    );
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
      this.transcribeChunk(session, payload).catch((e) =>
        this.logger.error('transcribeChunk error', e),
      );
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

    const now = Date.now();
    // sample every N ms and avoid overlap
    if (session.pendingVision) return;
    if (
      session.lastVideoFrameAt &&
      now - session.lastVideoFrameAt < session.visionIntervalMs
    )
      return;

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

      // Include stream type in analysis
      const text = await this.analyzeImage(session, dataUrl, frame.streamType);

      if (text) {
        const transcription: StreamTranscription = {
          sessionId,
          spaceId: session.spaceId,
          participantId: session.participantId,
          transcript: text,
          timestamp: Date.now(),
          confidence: 0.8,
          isFinal: true,
          type: 'video',
        };

        // Deliver to monitoring agents
        session.monitoringAgents.forEach((agentId) => {
          this.delivery.deliverTranscriptionToAgent(agentId, transcription);
        });
      }
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

  /** Use Chat Completions with image input for lightweight vision. */
  private async analyzeImage(
    session: MonitoringSession,
    imageDataUrl: string,
    streamType?: 'camera' | 'screen' | 'url',
  ): Promise<string | null> {
    const model = process.env.VISION_MODEL || 'gpt-4o-mini';

    // Customize prompt based on stream type
    let systemPrompt =
      'You are an AI stream monitor. Describe what is happening in the image briefly but clearly.';
    let prefix = '[VISUAL]';

    switch (streamType) {
      case 'screen':
        systemPrompt +=
          ' This is a screen share. Focus on applications, documents, code, presentations, and any shared content.';
        prefix = '[SCREEN]';
        break;
      case 'url':
        systemPrompt +=
          ' This is a web page capture. Focus on web content, articles, videos, forms, and user interactions with the page.';
        prefix = '[WEB]';
        break;
      case 'camera':
      default:
        systemPrompt +=
          ' This is a camera feed. Focus on people, actions, gestures, and any visible text or objects.';
        prefix = '[CAMERA]';
        break;
    }

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `${systemPrompt} Prefix your answer with ${prefix}.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this frame.' },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
                detail: session.imageDetail ?? 'low',
              },
            },
          ],
        },
      ],
      max_tokens: 180,
      temperature: 0.2,
    });

    const out = completion.choices[0]?.message?.content;
    this.logger.log(
      `Transcript for session ${session.sessionId} (${streamType || 'camera'}): ${out}`,
    );
    return typeof out === 'string' ? out.trim() : null;
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
