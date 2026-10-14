import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { UsageService } from '~/modules/usage';
import { TRANSCRIPTION_MODELS } from './audio-models';

/**
 * Speech-to-text for chat voice input. Accepts a finished recording
 * (webm/mp4/wav/ogg) and returns the transcription text.
 */
@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);
  private readonly openai?: OpenAI;
  private readonly model =
    process.env.AUDIO_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

  constructor(private readonly usage: UsageService) {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async transcribe(
    file: Express.Multer.File,
    billing: {
      principalId: string;
      durationMs: number;
      idempotencyKey: string;
      model?: string;
    },
  ): Promise<{ text: string }> {
    if (!this.openai) {
      throw new ServiceUnavailableException(
        'Transcription is not configured on this server',
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('No audio received');
    }

    const model = billing.model || this.model;
    if (!TRANSCRIPTION_MODELS.includes(model)) throw new BadRequestException('Choose a supported transcription model.');
    const mime = file.mimetype || 'audio/webm';
    const name = file.originalname || defaultFileName(mime);
    const durationMinutes = Math.max(1_000, billing.durationMs) / 60_000;
    const costUsd =
      durationMinutes *
      Number(model === this.model && process.env.OPENAI_TRANSCRIPTION_COST_USD_PER_MINUTE
        ? process.env.OPENAI_TRANSCRIPTION_COST_USD_PER_MINUTE
        : model === 'gpt-4o-mini-transcribe' ? 0.003 : 0.006);
    const reservation = await this.usage.authorizeCapability({
      principalId: billing.principalId,
      capability: 'transcription',
      estimatedCostUsd: costUsd,
      idempotencyKey: `capability:transcription:${billing.idempotencyKey}`,
      metadata: { model, durationMs: billing.durationMs },
    });
    try {
      const upload = await toFile(file.buffer, name, { type: mime });
      const result = await this.openai.audio.transcriptions.create({
        file: upload as any,
        model: model as any,
      } as any);
      await this.usage.settleCapability({
        reservationId: reservation?.reservationId,
        capability: 'transcription',
        actualCostUsd: costUsd,
        idempotencyKey: `capability:transcription:${billing.idempotencyKey}:capture`,
        metadata: {
          provider: 'openai',
          model,
          durationMs: billing.durationMs,
        },
      });
      return { text: ((result as any)?.text ?? '').trim() };
    } catch (error: any) {
      await this.usage.releaseCapability(reservation?.reservationId);
      this.logger.warn(`transcribe failed: ${error?.message ?? error}`);
      throw new BadRequestException(
        error?.message ?? 'Could not transcribe the audio recording',
      );
    }
  }
}

function defaultFileName(mime: string) {
  if (mime.includes('mp4')) return 'audio.mp4';
  if (mime.includes('ogg')) return 'audio.ogg';
  if (mime.includes('wav')) return 'audio.wav';
  return 'audio.webm';
}
