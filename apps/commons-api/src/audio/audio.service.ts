import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

/**
 * Speech-to-text for chat voice input. Accepts a finished recording
 * (webm/mp4/wav/ogg) and returns the transcription text.
 */
@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);
  private readonly openai?: OpenAI;
  private readonly model = process.env.AUDIO_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async transcribe(file: Express.Multer.File): Promise<{ text: string }> {
    if (!this.openai) {
      throw new ServiceUnavailableException('Transcription is not configured on this server');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('No audio received');
    }

    const mime = file.mimetype || 'audio/webm';
    const name = file.originalname || defaultFileName(mime);
    try {
      const upload = await toFile(file.buffer, name, { type: mime });
      const result = await this.openai.audio.transcriptions.create({
        file: upload as any,
        model: this.model as any,
      } as any);
      return { text: ((result as any)?.text ?? '').trim() };
    } catch (error: any) {
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
