import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AudioService } from './audio.service';

/** 25 MB — OpenAI's transcription upload ceiling. */
const MAX_AUDIO_BYTES = Number(process.env.AUDIO_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024);

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
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    const data = await this.audio.transcribe(file);
    return { data };
  }
}
