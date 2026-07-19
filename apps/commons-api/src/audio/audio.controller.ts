import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AudioService } from './audio.service';
import { resolveCallerId } from '~/modules/auth/owner.guard';
import type { Request } from 'express';
import { randomUUID } from 'crypto';

/** 25 MB — OpenAI's transcription upload ceiling. */
const MAX_AUDIO_BYTES = Number(
  process.env.AUDIO_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024,
);

@Controller({ version: '1', path: 'audio' })
export class AudioController {
  constructor(private readonly audio: AudioService) {}

  @Post('transcriptions')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
    }),
  )
  async transcribe(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { durationMs?: string },
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const principalId = resolveCallerId(req);
    if (!principalId) throw new UnauthorizedException();
    const data = await this.audio.transcribe(file, {
      principalId,
      durationMs: Number(body.durationMs || 0),
      idempotencyKey: idempotencyKey || randomUUID(),
    });
    return { data };
  }
}
