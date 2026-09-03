import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { WaveFile } from 'wavefile';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  MediaGenerateRequest,
  MediaProviderAdapter,
  MediaProviderOutput,
} from '../media.types';

@Injectable()
export class GoogleMediaProvider implements MediaProviderAdapter {
  readonly id = 'google';

  supports(modelId: string) {
    return /^(gemini-|veo-|lyria-)/.test(modelId);
  }

  async generate(input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    const client = this.client();
    if (input.model.kind === 'video') return this.video(client, input);
    if (input.model.kind === 'image') return this.image(client, input);
    if (input.model.kind === 'audio') return this.speech(client, input);
    if (input.model.kind === 'music') return this.music(client, input);
    throw new BadRequestException(`Unsupported media kind ${input.model.kind}`);
  }

  private client() {
    const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google media generation is not configured on this environment.',
      );
    }
    return new GoogleGenAI({ apiKey });
  }

  private async image(client: GoogleGenAI, request: MediaGenerateRequest) {
    const input: any[] = [{ type: 'text', text: request.prompt }];
    for (const asset of request.inputs) {
      if (!asset.mimeType.startsWith('image/')) {
        throw new BadRequestException('Nano Banana inputs must be images.');
      }
      input.push({
        type: 'image',
        mime_type: asset.mimeType,
        data: asset.buffer.toString('base64'),
      });
    }
    const interaction: any = await (client.interactions as any).create({
      model: request.model.modelId,
      input,
      response_format: {
        type: 'image',
        mime_type: 'image/png',
        aspect_ratio: String(request.settings.aspectRatio ?? '1:1'),
        ...(request.model.modelId !== 'gemini-3.1-flash-lite-image'
          ? { image_size: String(request.settings.imageSize ?? '1K') }
          : {}),
      },
    });
    const output = interaction.output_image;
    if (!output?.data) throw new BadGatewayException('Google returned no image.');
    return {
      buffer: Buffer.from(output.data, 'base64'),
      mimeType: output.mime_type ?? 'image/png',
      extension: output.mime_type === 'image/jpeg' ? 'jpg' : 'png',
      providerOperationId: interaction.id,
      metadata: { interactionId: interaction.id, synthId: true },
    } satisfies MediaProviderOutput;
  }

  private async speech(client: GoogleGenAI, request: MediaGenerateRequest) {
    const voice = String(request.settings.voice ?? 'Kore');
    const interaction: any = await (client.interactions as any).create({
      model: request.model.modelId,
      input: request.prompt,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
    });
    const output = interaction.output_audio;
    if (!output?.data) throw new BadGatewayException('Google returned no speech audio.');
    const pcm = Buffer.from(output.data, 'base64');
    const wave = new WaveFile();
    wave.fromScratch(1, 24_000, '16', new Int16Array(
      pcm.buffer,
      pcm.byteOffset,
      Math.floor(pcm.byteLength / 2),
    ));
    return {
      buffer: Buffer.from(wave.toBuffer()),
      mimeType: 'audio/wav',
      extension: 'wav',
      providerOperationId: interaction.id,
      metadata: { interactionId: interaction.id, voice, sourceEncoding: 'pcm_s16le' },
    } satisfies MediaProviderOutput;
  }

  private async music(client: GoogleGenAI, request: MediaGenerateRequest) {
    const input: any[] = [{ type: 'text', text: request.prompt }];
    const image = request.inputs[0];
    if (image) {
      if (!image.mimeType.startsWith('image/')) {
        throw new BadRequestException('Lyria reference input must be an image.');
      }
      input.push({
        type: 'image',
        mime_type: image.mimeType,
        data: image.buffer.toString('base64'),
      });
    }
    const interaction: any = await (client.interactions as any).create({
      model: request.model.modelId,
      input,
      response_format: { type: 'audio' },
    });
    const output = interaction.output_audio;
    if (!output?.data) throw new BadGatewayException('Google returned no music audio.');
    return {
      buffer: Buffer.from(output.data, 'base64'),
      mimeType: output.mime_type ?? 'audio/mpeg',
      extension: 'mp3',
      providerOperationId: interaction.id,
      metadata: { interactionId: interaction.id, lyrics: interaction.output_text },
    } satisfies MediaProviderOutput;
  }

  private async video(client: GoogleGenAI, request: MediaGenerateRequest) {
    const images = request.inputs.filter((input) => input.mimeType.startsWith('image/'));
    if (images.length !== request.inputs.length) {
      throw new BadRequestException('Veo reference inputs must be images.');
    }
    let operation: any = await (client.models as any).generateVideos({
      model: request.model.modelId,
      prompt: request.prompt,
      ...(images[0]
        ? {
            image: {
              imageBytes: images[0].buffer.toString('base64'),
              mimeType: images[0].mimeType,
            },
          }
        : {}),
      config: {
        aspectRatio: String(request.settings.aspectRatio ?? '16:9'),
        durationSeconds: Number(request.settings.durationSeconds ?? 8),
        resolution: String(request.settings.resolution ?? '720p'),
        ...(images[1]
          ? {
              lastFrame: {
                imageBytes: images[1].buffer.toString('base64'),
                mimeType: images[1].mimeType,
              },
            }
          : {}),
      },
    });
    await request.onProgress?.(10, operation.name);
    let polls = 0;
    while (!operation.done) {
      await delay(10_000);
      operation = await (client.operations as any).getVideosOperation({ operation });
      polls += 1;
      await request.onProgress?.(Math.min(90, 15 + polls * 5), operation.name);
      if (polls > 180) throw new BadGatewayException('Veo generation timed out.');
    }
    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) throw new BadGatewayException('Google returned no video.');
    const directory = await mkdtemp(join(tmpdir(), 'agent-commons-veo-'));
    const downloadPath = join(directory, 'generated.mp4');
    try {
      await (client.files as any).download({ file: video, downloadPath });
      return {
        buffer: await readFile(downloadPath),
        mimeType: 'video/mp4',
        extension: 'mp4',
        providerOperationId: operation.name,
        metadata: { operationName: operation.name, nativeAudio: true },
      } satisfies MediaProviderOutput;
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
