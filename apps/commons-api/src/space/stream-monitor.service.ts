import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { createCanvas, loadImage } from 'canvas';

export type StreamKind = 'camera' | 'screen' | 'web';

interface VideoStreamState {
  lastFrame?: Buffer; // raw image bytes (PNG/JPEG)
  width?: number;
  height?: number;
  updatedAt: number;
  kind: StreamKind;
}

interface AudioState {
  lastAudioLevel: number; // 0..1
  isSpeaking: boolean;
  updatedAt: number;
}

interface ParticipantStreamState {
  participantId: string;
  participantType: 'agent' | 'human';
  streams: Partial<Record<StreamKind, VideoStreamState>>;
  audio: AudioState;
}

interface CompositeFrameData {
  buffer: Buffer; // PNG
  dataUrl: string;
  generatedAt: number;
}

interface SpaceMonitorState {
  spaceId: string;
  participants: Map<string, ParticipantStreamState>;
  lastComposite?: CompositeFrameData;
  compositeInterval?: NodeJS.Timeout;
}

@Injectable()
export class StreamMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(StreamMonitorService.name);
  private readonly spaces = new Map<string, SpaceMonitorState>();
  private compositeMs = 2000; // composite generation interval
  private speakingHoldMs = 1500; // keep speaking flag for a while after last loud chunk
  private speakingThreshold = 0.03; // RMS threshold
  // Timers to flip off speaking state when we simulate speech (e.g., TTS playback on clients)
  private speakingTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly emitter: EventEmitter) {}

  /* ─────────────────────────  LIFECYCLE  ───────────────────────── */
  onModuleDestroy() {
    this.spaces.forEach((s) => {
      if (s.compositeInterval) clearInterval(s.compositeInterval);
    });
  }

  /* ─────────────────────────  PUBLIC API  ───────────────────────── */

  configure(opts: {
    compositeMs?: number;
    speakingHoldMs?: number;
    speakingThreshold?: number;
  }) {
    if (opts.compositeMs !== undefined) this.compositeMs = opts.compositeMs;
    if (opts.speakingHoldMs !== undefined)
      this.speakingHoldMs = opts.speakingHoldMs;
    if (opts.speakingThreshold !== undefined)
      this.speakingThreshold = opts.speakingThreshold;
  }

  ensureSpace(spaceId: string) {
    let state = this.spaces.get(spaceId);
    if (!state) {
      state = {
        spaceId,
        participants: new Map(),
      };
      this.spaces.set(spaceId, state);
      this.startCompositeLoop(spaceId);
    }
    return state;
  }

  removeParticipant(spaceId: string, participantId: string) {
    const space = this.spaces.get(spaceId);
    if (!space) return;
    space.participants.delete(participantId);
  }

  addOrUpdateVideoFrame(props: {
    spaceId: string;
    participantId: string;
    participantType: 'agent' | 'human';
    kind: StreamKind;
    frameBase64: string; // may include data URL prefix
    width?: number;
    height?: number;
  }) {
    const { spaceId, participantId, participantType, kind } = props;
    const space = this.ensureSpace(spaceId);
    const participant = this.ensureParticipant(
      space,
      participantId,
      participantType,
    );
    try {
      const raw = this.stripDataUrl(props.frameBase64);
      participant.streams[kind] = {
        lastFrame: Buffer.from(raw, 'base64'),
        width: props.width,
        height: props.height,
        updatedAt: Date.now(),
        kind,
      };
    } catch (e) {
      this.logger.warn(
        `Failed to process frame for ${participantId}: ${String(e)}`,
      );
    }
  }

  addOrUpdateAudioChunk(props: {
    spaceId: string;
    participantId: string;
    participantType: 'agent' | 'human';
    audioBase64: string; // PCM16LE mono (preferred) else treat as bytes
    sampleRate?: number;
    channels?: number;
  }) {
    const { spaceId, participantId, participantType } = props;
    const space = this.ensureSpace(spaceId);
    const participant = this.ensureParticipant(
      space,
      participantId,
      participantType,
    );
    try {
      const raw = Buffer.from(this.stripDataUrl(props.audioBase64), 'base64');
      const rms = this.computeRmsPcm16(raw);
      const now = Date.now();
      const wasSpeaking = participant.audio.isSpeaking;
      let isSpeaking = rms > this.speakingThreshold;
      // hold logic
      if (!isSpeaking && wasSpeaking) {
        // if within hold window, keep speaking
        if (now - participant.audio.updatedAt < this.speakingHoldMs) {
          isSpeaking = true;
        }
      }
      participant.audio = {
        lastAudioLevel: rms,
        isSpeaking,
        updatedAt: now,
      };
      this.emitAudioState(spaceId);
    } catch (e) {
      this.logger.warn(
        `Failed to process audio for ${participantId}: ${String(e)}`,
      );
    }
  }

  publishAgentFrame(props: {
    spaceId: string;
    agentId: string;
    kind: StreamKind;
    frameBase64: string;
  }) {
    this.addOrUpdateVideoFrame({
      spaceId: props.spaceId,
      participantId: props.agentId,
      participantType: 'agent',
      kind: props.kind,
      frameBase64: props.frameBase64,
    });
  }

  publishAgentAudio(props: {
    spaceId: string;
    agentId: string;
    audioBase64: string;
  }) {
    this.addOrUpdateAudioChunk({
      spaceId: props.spaceId,
      participantId: props.agentId,
      participantType: 'agent',
      audioBase64: props.audioBase64,
    });
  }

  /**
   * Mark an agent as speaking for a given duration (best-effort for synthetic audio like TTS).
   * This updates the audio_state feed so UIs can highlight the participant even if
   * we didn't ingest PCM chunks for RMS analysis on the server.
   */
  markAgentSpeakingFor(props: {
    spaceId: string;
    participantId: string;
    participantType?: 'agent' | 'human';
    durationMs: number;
    level?: number; // approximate level 0..1
  }) {
    const { spaceId, participantId } = props;
    const participantType = props.participantType || 'agent';
    const space = this.ensureSpace(spaceId);
    const participant = this.ensureParticipant(
      space,
      participantId,
      participantType,
    );

    const key = `${spaceId}:${participantId}`;
    const now = Date.now();
    const level = Math.max(0, Math.min(1, props.level ?? 0.2));

    // Set speaking on immediately
    participant.audio = {
      lastAudioLevel: level,
      isSpeaking: true,
      updatedAt: now,
    };
    this.emitAudioState(spaceId);

    // Clear any existing timer
    const existing = this.speakingTimers.get(key);
    if (existing) clearTimeout(existing);

    // Schedule speaking off
    const dur = Math.max(500, Math.min(props.durationMs, 120000)); // clamp 0.5s .. 120s
    const t = setTimeout(() => {
      try {
        const sp = this.spaces.get(spaceId);
        if (!sp) return;
        const p = sp.participants.get(participantId);
        if (!p) return;
        p.audio = {
          lastAudioLevel: 0,
          isSpeaking: false,
          updatedAt: Date.now(),
        };
        this.emitAudioState(spaceId);
      } finally {
        this.speakingTimers.delete(key);
      }
    }, dur);
    this.speakingTimers.set(key, t);
  }

  getLatestFrameDataForSpace(spaceId: string) {
    const space = this.spaces.get(spaceId);
    if (!space?.lastComposite) return { latestFrameUrl: undefined } as any;
    return {
      latestFrameUrl: space.lastComposite.dataUrl,
      generatedAt: space.lastComposite.generatedAt,
    };
  }

  getParticipantAudioStates(spaceId: string) {
    const space = this.spaces.get(spaceId);
    if (!space) return [];
    return Array.from(space.participants.values()).map((p) => ({
      participantId: p.participantId,
      participantType: p.participantType,
      audioLevel: p.audio.lastAudioLevel,
      isSpeaking: p.audio.isSpeaking,
      updatedAt: p.audio.updatedAt,
    }));
  }

  forceComposite(spaceId: string) {
    return this.generateComposite(spaceId).catch((e) => {
      this.logger.warn(`forceComposite failed: ${String(e)}`);
      return undefined;
    });
  }

  /* ─────────────────────────  INTERNAL  ───────────────────────── */

  private ensureParticipant(
    space: SpaceMonitorState,
    participantId: string,
    participantType: 'agent' | 'human',
  ) {
    let participant = space.participants.get(participantId);
    if (!participant) {
      participant = {
        participantId,
        participantType,
        streams: {},
        audio: {
          lastAudioLevel: 0,
          isSpeaking: false,
          updatedAt: Date.now(),
        },
      };
      space.participants.set(participantId, participant);
    }
    return participant;
  }

  private startCompositeLoop(spaceId: string) {
    const state = this.ensureSpace(spaceId);
    if (state.compositeInterval) return;
    state.compositeInterval = setInterval(() => {
      this.generateComposite(spaceId).catch((e) =>
        this.logger.debug(
          `Composite generation error (space ${spaceId}): ${e}`,
        ),
      );
    }, this.compositeMs);
  }

  private async generateComposite(spaceId: string) {
    const state = this.spaces.get(spaceId);
    if (!state) return;
    const participants = Array.from(state.participants.values());
    if (!participants.length) return;

    // Layout strategy:
    // If any screen stream present, make it large (1280x720), others as small thumbnails along bottom.
    // Else grid layout (max 4x4) 1280 width scaled.

    const width = 1280;
    const height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    const screenEntries: {
      participant: ParticipantStreamState;
      stream: VideoStreamState;
    }[] = [];
    const webEntries: {
      participant: ParticipantStreamState;
      stream: VideoStreamState;
    }[] = [];
    const cameraEntries: {
      participant: ParticipantStreamState;
      stream: VideoStreamState;
    }[] = [];

    for (const p of participants) {
      const scr = p.streams.screen;
      if (scr?.lastFrame) screenEntries.push({ participant: p, stream: scr });
      const web = p.streams.web;
      if (web?.lastFrame) webEntries.push({ participant: p, stream: web });
      const cam = p.streams.camera;
      if (cam?.lastFrame) cameraEntries.push({ participant: p, stream: cam });
    }

    let yOffsetForThumbs = height;

    const drawThumbnails = async (
      thumbs: {
        participant: ParticipantStreamState;
        stream: VideoStreamState;
      }[],
    ) => {
      const thumbH = 160;
      const thumbW = 160 * (16 / 9);
      yOffsetForThumbs = height - thumbH - 10;
      let x = 10;
      const sorted = thumbs.sort(
        (a, b) => b.stream.updatedAt - a.stream.updatedAt,
      );
      for (const t of sorted) {
        if (x + thumbW > width - 10) break;
        await this.drawFrame(
          ctx,
          t.stream.lastFrame!,
          x,
          yOffsetForThumbs,
          thumbW,
          thumbH,
        );
        this.drawSpeakingBadge(
          ctx,
          x,
          yOffsetForThumbs,
          thumbW,
          thumbH,
          t.participant,
        );
        x += thumbW + 10;
      }
    };

    if (webEntries.length) {
      // Web capture has highest priority
      webEntries.sort((a, b) => b.stream.updatedAt - a.stream.updatedAt);
      const main = webEntries[0];
      await this.drawFrame(ctx, main.stream.lastFrame!, 0, 0, width, height);
      // Build thumbnails from (remaining webs + all screens + all cameras) excluding main
      const thumbs: {
        participant: ParticipantStreamState;
        stream: VideoStreamState;
      }[] = [];
      for (let i = 1; i < webEntries.length; i++) thumbs.push(webEntries[i]);
      thumbs.push(...screenEntries);
      thumbs.push(...cameraEntries);
      await drawThumbnails(thumbs);
    } else if (screenEntries.length) {
      // Screen share next priority
      screenEntries.sort((a, b) => b.stream.updatedAt - a.stream.updatedAt);
      const main = screenEntries[0];
      await this.drawFrame(ctx, main.stream.lastFrame!, 0, 0, width, height);
      const thumbs: {
        participant: ParticipantStreamState;
        stream: VideoStreamState;
      }[] = [];
      for (let i = 1; i < screenEntries.length; i++)
        thumbs.push(screenEntries[i]);
      thumbs.push(...cameraEntries);
      await drawThumbnails(thumbs);
    } else {
      // No web or screen: grid of cameras (and any other stray kinds)
      const videoEntries = [...cameraEntries];
      if (!videoEntries.length) return;
      const n = videoEntries.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const cellW = Math.floor(width / cols);
      const cellH = Math.floor(height / rows);
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cellW;
        const y = row * cellH;
        const entry = videoEntries[i];
        await this.drawFrame(ctx, entry.stream.lastFrame!, x, y, cellW, cellH);
        this.drawSpeakingBadge(ctx, x, y, cellW, cellH, entry.participant);
      }
    }

    // Timestamp overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 260, 36);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Space: ${spaceId}`, 10, 18);
    ctx.fillText(new Date().toLocaleTimeString(), 10, 34);

    const buffer = canvas.toBuffer('image/png');
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
    state.lastComposite = { buffer, dataUrl, generatedAt: Date.now() };
    // Emit event
    try {
      this.emitter.emit('stream.monitor.composite', {
        spaceId,
        dataUrl,
        generatedAt: state.lastComposite.generatedAt,
      });
    } catch {}
  }

  private async drawFrame(
    ctx: any,
    buffer: Buffer,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    try {
      const img = await loadImage(buffer);
      // cover fit
      const ratio = Math.max(w / img.width, h / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const dx = x + (w - drawW) / 2;
      const dy = y + (h - drawH) / 2;
      (ctx as any).drawImage(img, dx, dy, drawW, drawH);
    } catch (e) {
      ctx.fillStyle = '#333';
      ctx.fillRect(x, y, w, h);
    }
  }

  private drawSpeakingBadge(
    ctx: any,
    x: number,
    y: number,
    w: number,
    h: number,
    participant: ParticipantStreamState,
  ) {
    const { isSpeaking, lastAudioLevel } = participant.audio;
    const badgeW = 120;
    const badgeH = 30;
    ctx.fillStyle = isSpeaking ? 'rgba(0,200,0,0.6)' : 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 6, y + 6, badgeW, badgeH);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      `${participant.participantId.slice(0, 10)}${
        participant.participantId.length > 10 ? '…' : ''
      }`,
      x + 10,
      y + 24,
    );
    // audio bar
    const barW = Math.min(1, lastAudioLevel * 4) * (w - 20);
    ctx.fillStyle = isSpeaking ? '#0f0' : '#888';
    ctx.fillRect(x + 10, y + h - 14, barW, 8);
  }

  private computeRmsPcm16(buf: Buffer) {
    if (buf.length < 4) return 0;
    const samples = buf.length / 2;
    let sumSq = 0;
    for (let i = 0; i < buf.length; i += 2) {
      const sample = buf.readInt16LE(i) / 32768; // -1..1
      sumSq += sample * sample;
    }
    return Math.sqrt(sumSq / samples);
  }

  private emitAudioState(spaceId: string) {
    const participants = this.getParticipantAudioStates(spaceId);
    try {
      this.emitter.emit('stream.monitor.audio_state', {
        spaceId,
        participants,
      });
    } catch {}
  }

  private stripDataUrl(data: string) {
    const idx = data.indexOf('base64,');
    if (idx !== -1) return data.substring(idx + 7);
    return data; // assume pure base64
  }
}
