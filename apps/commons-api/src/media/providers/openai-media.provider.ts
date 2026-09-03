import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { estimateMediaCost } from '../media-model.registry';
import type { MediaGenerateRequest, MediaProviderAdapter, MediaProviderOutput } from '../media.types';

const API_BASE = 'https://api.openai.com/v1';

@Injectable()
export class OpenAIMediaProvider implements MediaProviderAdapter {
  readonly id = 'openai';

  supports(modelId: string) {
    return /^(gpt-image-|gpt-4o-mini-tts|sora-2)/.test(modelId);
  }

  async generate(input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('OpenAI media generation is not configured on this environment.');
    if (input.model.kind === 'image') return this.image(new OpenAI({ apiKey }), input);
    if (input.model.kind === 'audio') return this.speech(new OpenAI({ apiKey }), input);
    if (input.model.kind === 'video') return this.video(apiKey, input);
    throw new BadRequestException(`OpenAI does not provide ${input.model.kind} generation in this catalog.`);
  }

  private async image(client: OpenAI, input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    const ratio = String(input.settings.aspectRatio ?? '1:1');
    const size = ratio === '3:2' ? '1536x1024' : ratio === '2:3' ? '1024x1536' : '1024x1024';
    const common = {
      model: input.model.modelId,
      prompt: input.prompt,
      size,
      quality: String(input.settings.quality ?? 'medium'),
      background: String(input.settings.background ?? 'auto'),
      output_format: 'png',
    } as any;
    const response = input.inputs.length
      ? await client.images.edit({
          ...common,
          image: await Promise.all(input.inputs.map((asset) => toFile(asset.buffer, asset.name, { type: asset.mimeType }))),
        } as any)
      : await client.images.generate(common);
    const image = response.data?.[0] as any;
    let buffer: Buffer;
    if (image?.b64_json) buffer = Buffer.from(image.b64_json, 'base64');
    else if (image?.url) {
      const downloaded = await fetch(image.url);
      if (!downloaded.ok) throw new BadGatewayException('Could not download the generated OpenAI image.');
      buffer = Buffer.from(await downloaded.arrayBuffer());
    } else throw new BadGatewayException('OpenAI returned no generated image.');
    const usage = (response as any).usage as Record<string, any> | undefined;
    const fallbackCostUsd = estimateMediaCost(input.model, input.prompt, input.settings, input.inputs.map((asset) => asset.kind));
    const textInputTokens = Number(usage?.input_tokens_details?.text_tokens ?? 0);
    const imageInputTokens = Number(usage?.input_tokens_details?.image_tokens ?? usage?.input_tokens ?? 0);
    const outputTokens = Number(usage?.output_tokens ?? 0);
    const measuredCostUsd = (textInputTokens * 5 + imageInputTokens * 8 + outputTokens * 30) / 1_000_000;
    const actualCostUsd = measuredCostUsd > 0 ? measuredCostUsd : fallbackCostUsd;
    return {
      buffer, mimeType: 'image/png', extension: 'png',
      metadata: { usage, revisedPrompt: image.revised_prompt, size },
      billing: { actualCostUsd, quantity: outputTokens || 1, unit: outputTokens ? 'image_output_token' : 'image', unitPriceUsd: outputTokens ? 30 / 1_000_000 : actualCostUsd, source: outputTokens ? 'provider_usage' : 'catalog', providerUsage: usage },
    };
  }

  private async speech(client: OpenAI, input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    const format = String(input.settings.format ?? 'mp3');
    const response = await client.audio.speech.create({
      model: input.model.modelId,
      voice: String(input.settings.voice ?? 'coral') as any,
      input: input.prompt,
      instructions: String(input.settings.instructions ?? 'Speak clearly and naturally.'),
      response_format: format as any,
    } as any);
    const buffer = Buffer.from(await response.arrayBuffer());
    const actualCostUsd = estimateMediaCost(input.model, input.prompt, input.settings);
    const mimeType = format === 'wav' ? 'audio/wav' : format === 'aac' ? 'audio/aac' : format === 'opus' ? 'audio/ogg' : 'audio/mpeg';
    return {
      buffer, mimeType, extension: format,
      metadata: { voice: input.settings.voice, instructions: input.settings.instructions },
      billing: { actualCostUsd, quantity: Math.ceil(input.prompt.length / 15), unit: 'estimated_audio_second', unitPriceUsd: actualCostUsd, source: 'catalog' },
    };
  }

  private async video(apiKey: string, input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    const ratio = String(input.settings.aspectRatio ?? '16:9');
    const created = await openaiRequest(apiKey, '/videos', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model.modelId,
        prompt: input.prompt,
        size: ratio === '9:16' ? '720x1280' : '1280x720',
        seconds: String(input.settings.durationSeconds ?? 8),
      }),
    });
    const videoId = String(created.id ?? '');
    if (!videoId) throw new BadGatewayException('OpenAI returned no video job identifier.');
    let job = created;
    for (let poll = 0; poll < 240; poll += 1) {
      const status = String(job.status ?? '').toLowerCase();
      if (status === 'completed') break;
      if (['failed', 'cancelled'].includes(status)) throw new BadGatewayException(job.error?.message || `OpenAI video generation ${status}.`);
      if (poll) await delay(5_000);
      job = await openaiRequest(apiKey, `/videos/${encodeURIComponent(videoId)}`);
      await input.onProgress?.(Math.min(94, Number(job.progress ?? 4 + poll * 2)), videoId);
    }
    if (String(job.status).toLowerCase() !== 'completed') throw new BadGatewayException('OpenAI video generation timed out.');
    const content = await fetch(`${API_BASE}/videos/${encodeURIComponent(videoId)}/content`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!content.ok) throw new BadGatewayException(`Could not download OpenAI video (${content.status}).`);
    const buffer = Buffer.from(await content.arrayBuffer());
    const actualCostUsd = estimateMediaCost(input.model, input.prompt, input.settings);
    return {
      buffer, mimeType: 'video/mp4', extension: 'mp4', providerOperationId: videoId,
      metadata: { videoId, status: job.status, progress: job.progress, expiresAt: job.expires_at },
      billing: { actualCostUsd, quantity: Number(input.settings.durationSeconds ?? 8), unit: 'second', unitPriceUsd: input.model.pricing.usd, source: 'catalog' },
    };
  }
}

async function openaiRequest(apiKey: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new BadGatewayException(payload?.error?.message || `OpenAI API returned ${response.status}.`);
  return payload;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
