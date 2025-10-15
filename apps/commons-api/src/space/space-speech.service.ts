import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';
import { and, eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { WaveFile } from 'wavefile';
import { TranscriptionDeliveryService } from './transcription-delivery.service';

interface IngestChunk {
  spaceId: string;
  participantId: string;
  participantType: 'agent' | 'human';
  audioBase64: string; // PCM16LE mono
  sampleRate?: number; // default 16000
  channels?: number; // default 1
}

interface ParticipantSpeechState {
  buffers: Buffer[];
  lastChunkAt: number;
  sampleRate: number;
  lastActiveAt: number;
  segmentStartAt: number; // wall-clock start time of current buffered segment
  isFlushing: boolean;
}

@Injectable()
export class SpaceSpeechService implements OnModuleDestroy {
  private readonly logger = new Logger(SpaceSpeechService.name);
  private readonly states = new Map<string, ParticipantSpeechState>();
  private readonly openai?: OpenAI;

  // Segmentation is primarily time-based; VAD only for metadata/heuristics
  private readonly threshold = parseFloat(
    process.env.SPEECH_RMS_THRESHOLD || '0.03',
  ); // RMS threshold (optional metadata)
  private readonly targetChunkMs = parseInt(
    process.env.SPEECH_TARGET_CHUNK_MS || '2200',
    10,
  ); // aim to flush around this duration
  private readonly maxSegmentMs = parseInt(
    process.env.SPEECH_MAX_SEGMENT_MS || '8000',
    10,
  ); // hard cut regardless of speaking
  private readonly idleFlushMs = parseInt(
    process.env.SPEECH_IDLE_FLUSH_MS || '700',
    10,
  ); // flush if no chunks arrive for this long
  private readonly minSegmentMs = parseInt(
    process.env.SPEECH_MIN_SEGMENT_MS || '350',
    10,
  ); // avoid finalizing ultra-short blips
  private tickInterval?: NodeJS.Timeout;

  constructor(
    private readonly db: DatabaseService,
    private readonly delivery: TranscriptionDeliveryService,
    private readonly emitter: EventEmitter,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn(
        'OPENAI_API_KEY not set — speech transcription will be skipped.',
      );
    }
    // GC timer to trim stale buffers
    setInterval(() => this.gc(), 30_000).unref?.();
    // Periodic tick to decide flush based on time (not just silence)
    this.tickInterval = setInterval(() => this.tick(), 250);
    (this.tickInterval as any).unref?.();
  }

  async ingestAudioChunk(evt: IngestChunk) {
    try {
      const key = this.key(evt.spaceId, evt.participantId);
      const state = this.ensureState(key, evt.sampleRate);
      const raw = Buffer.from(this.stripDataUrl(evt.audioBase64), 'base64');
      // Append raw as-is (PCM16LE mono expected)
      if (state.buffers.length === 0) {
        // New segment starting
        state.segmentStartAt = Date.now();
      }
      state.buffers.push(raw);
      const now = Date.now();
      state.lastChunkAt = now;

      // Optional VAD metadata tracking (not required for segmentation)
      const rms = this.computeRmsPcm16(raw);
      if (rms > this.threshold) state.lastActiveAt = now;
      if (process.env.DEBUG_SPEECH === '1') {
        const wallElapsed = now - state.segmentStartAt;
        const durationMs = this.estimateDurationMs(state);
        this.logger.debug(
          `ingest: space=${evt.spaceId} p=${evt.participantId} rms=${rms.toFixed(
            4,
          )} dur=${durationMs.toFixed(1)}ms wall=${wallElapsed}ms`,
        );
      }
    } catch (e) {
      this.logger.warn(`ingestAudioChunk error: ${String(e)}`);
    }
  }

  /* ─────────────────────────  INTERNAL  ───────────────────────── */
  private key(spaceId: string, participantId: string) {
    return `${spaceId}::${participantId}`;
  }

  private ensureState(key: string, sampleRate?: number) {
    const existing = this.states.get(key);
    if (!existing) {
      const created: ParticipantSpeechState = {
        buffers: [],
        lastChunkAt: Date.now(),
        sampleRate: sampleRate || 16000,
        lastActiveAt: 0,
        segmentStartAt: Date.now(),
        isFlushing: false,
      };
      this.states.set(key, created);
      return created;
    }
    if (sampleRate && existing.sampleRate !== sampleRate)
      existing.sampleRate = sampleRate;
    return existing;
  }

  private estimateDurationMs(state: ParticipantSpeechState) {
    const bytes = state.buffers.reduce((n, b) => n + b.length, 0);
    // PCM16 mono: 2 bytes per sample
    const samples = bytes / 2;
    return (samples / state.sampleRate) * 1000;
  }

  private computeRmsPcm16(buf: Buffer) {
    if (buf.length < 4) return 0;
    const samples = buf.length / 2;
    let sumSq = 0;
    for (let i = 0; i < buf.length; i += 2) {
      const sample = buf.readInt16LE(i) / 32768;
      sumSq += sample * sample;
    }
    return Math.sqrt(sumSq / samples);
  }

  private stripDataUrl(data: string) {
    const idx = data.indexOf('base64,');
    if (idx !== -1) return data.substring(idx + 7);
    return data;
  }

  // Accept a complete utterance as base64 (supports WAV or WEBM) and transcribe directly.
  async transcribeUtteranceFromBase64(args: {
    spaceId: string;
    participantId: string;
    base64Audio: string; // may include data URL prefix
    mime?: string; // e.g., 'audio/wav' | 'audio/webm'
    fileName?: string; // default inferred
    model?: string; // optional override
  }) {
    const { spaceId, participantId } = args;
    if (!this.openai) return;
    try {
      const rawB64 = this.stripDataUrl(args.base64Audio);
      const buffer = Buffer.from(rawB64, 'base64');
      if (buffer.length < 64) return; // sanity check
      const mime = args.mime || 'audio/wav';
      const fileName =
        args.fileName || (mime.includes('webm') ? 'audio.webm' : 'audio.wav');
      const file = await toFile(buffer, fileName, { type: mime });
      const res = await this.openai.audio.transcriptions.create({
        file: file as any,
        model: (args.model as any) || 'whisper-1',
        //language: 'en',
      } as any);
      const text = (res as any)?.text || '';
      if (!text.trim()) return;
      await this.broadcastTranscript(spaceId, participantId, text);
    } catch (e) {
      this.logger.warn(`transcribeUtteranceFromBase64 error: ${String(e)}`);
    }
  }

  private async finalizeAndDispatch(args: {
    spaceId: string;
    participantId: string;
    participantType: 'agent' | 'human';
    pcm: Buffer;
    sampleRate: number;
  }) {
    const { spaceId, participantId, participantType, pcm, sampleRate } = args;
    console.log('finalizeAndDispatch called');
    if (!this.openai) return; // no-op if not configured
    // Skip if audio too short (< ~250ms)
    const minBytes = Math.max(1, Math.floor(sampleRate * 2 * 0.25));
    if (pcm.length < minBytes) {
      if (process.env.DEBUG_SPEECH === '1') {
        this.logger.debug(
          `skip transcription: short audio len=${pcm.length}B < ${minBytes}B`,
        );
      }
      return;
    }
    // Encode WAV in-memory
    const wav = new WaveFile();
    const int16 = new Int16Array(
      pcm.buffer,
      pcm.byteOffset,
      pcm.byteLength / 2,
    );
    wav.fromScratch(1, sampleRate, '16', int16);
    const wavBuffer = Buffer.from(wav.toBuffer());

    // Prepare a proper file for the SDK (multipart upload)
    const file = await toFile(wavBuffer, 'audio.wav', {
      type: 'audio/wav',
    });

    let transcriptText = '';
    try {
      const res = await this.openai.audio.transcriptions.create({
        file: file as any,
        model: 'gpt-4o-mini-transcribe',
        language: 'en', // optionally set
        // temperature: 0.0,
      } as any);
      // SDK returns { text }
      transcriptText = (res as any)?.text || '';
      console.log('Transcription result: ', transcriptText);
    } catch (e) {
      this.logger.warn(`Transcription failed: ${String(e)}`);
      return;
    }

    if (!transcriptText.trim()) return;

    await this.broadcastTranscript(spaceId, participantId, transcriptText);
  }

  // Direct WAV transcription for client-provided utterances (highest fidelity path)
  async transcribeWavUtterance(args: {
    spaceId: string;
    participantId: string;
    wavBase64: string; // may include data URL prefix
  }) {
    const { spaceId, participantId } = args;
    if (!this.openai) return;
    try {
      const rawB64 = this.stripDataUrl(args.wavBase64);
      const wavBuffer = Buffer.from(rawB64, 'base64');
      // Quick sanity: minimal header size
      if (wavBuffer.length < 64) return;
      const file = await toFile(wavBuffer, 'audio.wav', {
        type: 'audio/wav',
      });
      const res = await this.openai.audio.transcriptions.create({
        file: file as any,
        model: 'whisper-1',
        language: 'en',
      } as any);
      const text = (res as any)?.text || '';
      if (!text.trim()) return;
      await this.broadcastTranscript(spaceId, participantId, text);
    } catch (e) {
      this.logger.warn(`transcribeWavUtterance error: ${String(e)}`);
    }
  }

  private async broadcastTranscript(
    spaceId: string,
    participantId: string,
    transcript: string,
  ) {
    const timestamp = Date.now();
    try {
      this.emitter.emit('space.transcription.created', {
        spaceId,
        participantId,
        transcript,
        timestamp,
      });
    } catch {}

    const subscribed = await this.db.query.spaceMember.findMany({
      where: and(
        eq(schema.spaceMember.spaceId, spaceId),
        eq(schema.spaceMember.memberType, 'agent'),
        eq(schema.spaceMember.isSubscribed, true),
        eq(schema.spaceMember.status, 'active'),
      ),
    });
    const agentIds = subscribed.map((m) => m.memberId);
    if (!agentIds.length) return;
    await this.delivery.broadcastTranscriptionToSpace(
      spaceId,
      {
        sessionId: `${spaceId}:${participantId}`,
        spaceId,
        participantId,
        transcript,
        timestamp,
        confidence: 0.9,
        isFinal: true,
        type: 'audio',
      },
      agentIds,
    );
  }

  private gc() {
    const now = Date.now();
    for (const [key, st] of this.states) {
      if (now - st.lastChunkAt > 60_000) {
        this.states.delete(key);
      }
    }
  }

  private async tick() {
    const now = Date.now();
    for (const [key, st] of this.states) {
      if (!st.buffers.length) continue;
      const wallElapsed = now - st.segmentStartAt;
      const idleElapsed = now - st.lastChunkAt;
      const durationMs = this.estimateDurationMs(st);
      const shouldFlush =
        wallElapsed >= this.maxSegmentMs ||
        wallElapsed >= this.targetChunkMs ||
        (idleElapsed >= this.idleFlushMs && wallElapsed >= this.minSegmentMs);
      if (shouldFlush) {
        await this.flush(key, st).catch((e) =>
          this.logger.debug(`flush error: ${String(e)}`),
        );
      }
    }
  }

  private async flush(key: string, st: ParticipantSpeechState) {
    if (st.isFlushing) return;
    if (!st.buffers.length) return;
    st.isFlushing = true;
    const pcm = Buffer.concat(st.buffers);
    st.buffers = [];
    const sampleRate = st.sampleRate;
    st.segmentStartAt = Date.now();
    try {
      // Derive ids from key
      const [spaceId, participantId] = key.split('::');
      await this.finalizeAndDispatch({
        spaceId,
        participantId,
        participantType: 'human', // participantType not in key; transcript payload contains participantId for agents to attribute
        pcm,
        sampleRate,
      });
    } finally {
      st.isFlushing = false;
    }
  }

  onModuleDestroy() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }
}
