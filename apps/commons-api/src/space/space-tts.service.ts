import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { DatabaseService } from '~/modules/database/database.service';
import { eq } from 'drizzle-orm';
import { OpenAIService } from '~/modules/openai/openai.service';
import * as schema from '#/models/schema';
import { SessionService } from '~/session/session.service';

export type TtsProvider = 'openai' | 'elevenlabs';

export interface SpeakArgs {
  spaceId: string;
  agentId: string; // who is speaking
  text: string;
  provider?: TtsProvider;
  voice?: string; // OpenAI voice name OR ElevenLabs voiceId
  format?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';
  instructions?: string; // optional style prompt
}

export interface SpeakResult {
  success: boolean;
  mime: string;
  bytes: number;
}

@Injectable()
export class SpaceTtsService {
  private readonly logger = new Logger(SpaceTtsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly emitter: EventEmitter,
    private readonly openai: OpenAIService,
    @Inject(forwardRef(() => SessionService))
    private readonly session: SessionService,
  ) {}

  /**
   * Generate speech audio for an agent and broadcast to all members of the space.
   * Emits EventEmitter event 'space.tts.audio' with base64 audio payload.
   * The SpaceRtcGateway listens to this and relays to clients, and also marks
   * the agent as speaking in the StreamMonitor for the approximate duration.
   */
  async speak(args: SpeakArgs): Promise<SpeakResult> {
    const {
      spaceId,
      agentId,
      text,
      provider: providerOverride,
      voice: voiceOverride,
      format = 'mp3',
      instructions,
    } = args;

    if (!text?.trim()) {
      return { success: false, mime: 'text/plain', bytes: 0 };
    }

    // Resolve agent voice preferences
    const agent = await this.db.query.agent.findFirst({
      where: (tbl) => eq(tbl.agentId, agentId),
    });

    const provider: TtsProvider =
      providerOverride || (agent?.ttsProvider as TtsProvider) || 'openai';
    const voice: string =
      voiceOverride || agent?.ttsVoice || this.defaultVoiceFor(provider);

    try {
      const { buffer, mime } =
        provider === 'elevenlabs'
          ? await this.generateWithElevenLabs({ text, voice, format })
          : await this.generateWithOpenAI({
              text,
              voice,
              format,
              instructions,
            });

      // Debug: optionally save raw audio to temp directory for inspection
      await this.debugSaveAudio({
        buffer,
        spaceId,
        agentId,
        provider,
        format,
      });

      // Broadcast to space via EventEmitter → SpaceRtcGateway
      const base64 = buffer.toString('base64');
      try {
        this.emitter.emit('space.tts.audio', {
          spaceId,
          participantId: agentId,
          participantType: 'agent',
          audio: `data:${mime};base64,${base64}`,
          mime,
          text,
          provider,
          voice,
          at: Date.now(),
          bytes: buffer.length,
          // Optional ordering hint so clients may schedule sequential playback per space
          playbackId: `${spaceId}:${agentId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        });
      } catch {}

      // Append this speech content into other agents' sessions as a user message (no runAgent trigger)
      await this.appendSpeechToOtherAgentSessions({
        spaceId,
        fromAgentId: agentId,
        text,
      }).catch((e) =>
        this.logger.debug(
          `appendSpeechToOtherAgentSessions error: ${String(e)}`,
        ),
      );

      return { success: true, mime, bytes: buffer.length };
    } catch (e) {
      this.logger.warn(`speak failed (${provider}): ${String(e)}`);
      return { success: false, mime: 'application/octet-stream', bytes: 0 };
    }
  }

  private async appendSpeechToOtherAgentSessions(args: {
    spaceId: string;
    fromAgentId: string;
    text: string;
  }) {
    const { spaceId, fromAgentId, text } = args;
    const members = await this.db.query.spaceMember.findMany({
      where: (t) =>
        eq(t.spaceId, spaceId) &&
        eq(t.memberType, 'agent') &&
        eq(t.status, 'active') &&
        eq(t.isSubscribed, true),
    });
    const targets: string[] = (members || [])
      .map((m) => (m as any).memberId)
      .filter((id) => id !== fromAgentId);
    if (!targets.length) return;
    const atIso = new Date().toISOString();
    await Promise.all(
      targets.map(async (agentId) => {
        const { session } = await this.session.getOrCreateAgentSpaceSession({
          agentId,
          spaceId,
          initiator: fromAgentId,
        });

        // Use existing history from session object
        const history = (session.history as any[]) || [];

        const entry = {
          role: 'user',
          content: ` Participant: ${fromAgentId}
            Timestamp: ${new Date().toISOString()}
            MessageContent:${text}`,
          timestamp: atIso,
          metadata: {
            participantId: fromAgentId,
            spaceId,
            source: 'agent_speech',
          },
        };

        const updatedHistory = [...history, entry];

        // Use session service updateSession method to ensure proper persistence
        const result = await this.session.updateSession({
          id: session.sessionId,
          delta: {
            history: updatedHistory,
            updatedAt: new Date(),
          },
        });
      }),
    );
  }

  private defaultVoiceFor(provider: TtsProvider) {
    if (provider === 'elevenlabs') {
      return (
        process.env.ELEVENLABS_DEFAULT_VOICE_ID || '21m00Tcm4TlvDq8ikWAM' // common demo voice id (Rachel) – replace via env in prod
      );
    }
    // OpenAI built-in voice
    return process.env.OPENAI_TTS_DEFAULT_VOICE || 'coral';
  }

  private async generateWithOpenAI(args: {
    text: string;
    voice: string;
    format: NonNullable<SpeakArgs['format']>;
    instructions?: string;
  }): Promise<{ buffer: Buffer; mime: string }> {
    const { text, voice, format, instructions } = args;
    const response = await (this.openai as any).audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice,
      input: text,
      instructions,
      response_format: format === 'mp3' ? undefined : format,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = this.mimeForFormat(format, 'openai');
    return { buffer, mime };
  }

  private async generateWithElevenLabs(args: {
    text: string;
    voice: string; // voiceId
    format: NonNullable<SpeakArgs['format']>;
  }): Promise<{ buffer: Buffer; mime: string }> {
    const { text, voice, format } = args;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

    const gotMod = await import('got');
    const got = gotMod.default || (gotMod as any);

    // Map generic format to ElevenLabs specific
    const acceptMime = this.mimeForFormat(format, 'elevenlabs');
    // For ElevenLabs we can set output_format for more control; keep default via headers for simplicity
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;
    const res = await got.post(url, {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: acceptMime,
      },
      responseType: 'buffer',
      json: {
        text,
        model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.7,
          style: 0.0,
          use_speaker_boost: true,
        },
      },
    });
    const buffer: Buffer = (res as any).rawBody || (res as any).body;
    return { buffer, mime: acceptMime };
  }

  private mimeForFormat(
    format: NonNullable<SpeakArgs['format']>,
    provider: TtsProvider,
  ): string {
    switch (format) {
      case 'wav':
        return 'audio/wav';
      case 'opus':
        return provider === 'elevenlabs'
          ? 'audio/opus'
          : 'audio/ogg; codecs=opus';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      case 'pcm':
        return 'audio/pcm';
      case 'mp3':
      default:
        return 'audio/mpeg';
    }
  }

  private async debugSaveAudio(args: {
    buffer: Buffer;
    spaceId: string;
    agentId: string;
    provider: TtsProvider;
    format: NonNullable<SpeakArgs['format']>;
  }) {
    try {
      if (process.env.TTS_DEBUG_SAVE !== 'true') return;
      const dir = path.join(os.tmpdir(), 'agent-commons', 'tts');
      await fs.promises.mkdir(dir, { recursive: true });
      const ext = this.extensionForFormat(args.format);
      const file = path.join(
        dir,
        `${Date.now()}_${args.spaceId}_${args.agentId}_${args.provider}.${ext}`,
      );
      await fs.promises.writeFile(file, args.buffer);
      this.logger.log(
        `TTS debug saved (${args.provider}/${args.format}) -> ${file} (${args.buffer.length} bytes)`,
      );
    } catch (e) {
      this.logger.debug(`TTS debug save failed: ${String(e)}`);
    }
  }

  private extensionForFormat(format: NonNullable<SpeakArgs['format']>) {
    switch (format) {
      case 'mp3':
        return 'mp3';
      case 'wav':
        return 'wav';
      case 'opus':
        return 'opus';
      case 'aac':
        return 'aac';
      case 'flac':
        return 'flac';
      case 'pcm':
        return 'pcm';
      default:
        return 'bin';
    }
  }
}
