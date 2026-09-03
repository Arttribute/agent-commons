import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { safeFetch } from '~/utils/safe-fetch';
import { actualMediaCostFromUsage, estimateMediaCost, mediaUnitPrice } from '../media-model.registry';
import type { MediaGenerateRequest, MediaProviderAdapter, MediaProviderOutput } from '../media.types';

const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';

@Injectable()
export class BytePlusMediaProvider implements MediaProviderAdapter {
  readonly id = 'byteplus';

  supports(modelId: string) {
    return /seedream|seedance/i.test(modelId);
  }

  async generate(input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    if (!process.env.ARK_API_KEY && !process.env.BYTEPLUS_ARK_API_KEY) {
      throw new ServiceUnavailableException('BytePlus ModelArk media generation is not configured on this environment.');
    }
    return input.model.kind === 'image' ? this.image(input) : this.video(input);
  }

  private async image(input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    const payload = await this.request('/images/generations', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model.modelId,
        prompt: input.prompt,
        ...(input.inputs.length ? { image: input.inputs.map(dataUrl) } : {}),
        size: String(input.settings.imageSize ?? '2K'),
        output_format: input.model.modelId.includes('5-0') ? 'png' : 'jpeg',
        response_format: 'b64_json',
        watermark: false,
      }),
    });
    const encoded = payload?.data?.[0]?.b64_json;
    if (!encoded) throw new BadGatewayException('ModelArk returned no generated image.');
    const mimeType = input.model.modelId.includes('5-0') ? 'image/png' : 'image/jpeg';
    const inputKinds = input.inputs.map((asset) => asset.kind);
    const actualCostUsd = estimateMediaCost(input.model, input.prompt, input.settings, inputKinds);
    return {
      buffer: Buffer.from(encoded, 'base64'), mimeType, extension: mimeType === 'image/png' ? 'png' : 'jpg',
      providerOperationId: payload.id ?? payload.created?.toString(),
      metadata: { requestId: payload.id, usage: payload.usage },
      billing: {
        actualCostUsd, quantity: 1, unit: 'image', unitPriceUsd: actualCostUsd, source: 'catalog',
        providerUsage: { ...safeUsage(payload.usage), generatedImages: 1 },
      },
    };
  }

  private async video(input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    const flags = [
      `--resolution ${String(input.settings.resolution ?? '720p').replace('p', '')}`,
      `--duration ${Number(input.settings.durationSeconds ?? 5)}`,
      `--ratio ${String(input.settings.aspectRatio ?? '16:9')}`,
      `--camerafixed ${Boolean(input.settings.cameraFixed)}`,
      `--generate_audio ${Boolean(input.settings.generateAudio)}`,
    ].join(' ');
    const created = await this.request('/contents/generations/tasks', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model.modelId,
        content: [
          { type: 'text', text: `${input.prompt} ${flags}` },
          ...input.inputs.map((asset) => {
            if (asset.mimeType.startsWith('image/')) return { type: 'image_url', image_url: { url: dataUrl(asset) } };
            if (asset.mimeType.startsWith('video/')) return { type: 'video_url', video_url: { url: dataUrl(asset) } };
            return { type: 'audio_url', audio_url: { url: dataUrl(asset) } };
          }),
        ],
      }),
    });
    const taskId = String(created.id ?? created.task_id ?? '');
    if (!taskId) throw new BadGatewayException('ModelArk returned no task identifier.');
    let result: any;
    for (let poll = 0; poll < 240; poll += 1) {
      if (poll) await delay(5_000);
      result = await this.request(`/contents/generations/tasks/${encodeURIComponent(taskId)}`);
      const status = String(result.status ?? '').toLowerCase();
      await input.onProgress?.(Math.min(92, 8 + poll * 2), taskId);
      if (status === 'succeeded') break;
      if (status === 'failed' || status === 'cancelled') throw new BadGatewayException(result.error?.message || `Seedance generation ${status}.`);
    }
    if (String(result?.status).toLowerCase() !== 'succeeded') throw new BadGatewayException('Seedance generation timed out.');
    const url = result.content?.video_url ?? result.content?.[0]?.video_url ?? result.video_url;
    if (!url) throw new BadGatewayException('ModelArk returned no generated video.');
    const downloaded = await downloadProviderOutput(String(url), 500 * 1024 * 1024);
    const completionTokens = Number(result.usage?.completion_tokens ?? 0);
    const inputKinds = input.inputs.map((asset) => asset.kind);
    const unitPriceUsd = mediaUnitPrice(input.model, input.settings, inputKinds);
    const estimated = estimateMediaCost(input.model, input.prompt, input.settings, inputKinds);
    const providerUsage = { completionTokens, unitPriceUsd, totalTokens: result.usage?.total_tokens, durationSeconds: result.duration, resolution: result.resolution, fps: result.fps };
    const actualCostUsd = actualMediaCostFromUsage(input.model, providerUsage, estimated);
    return {
      buffer: downloaded.buffer, mimeType: 'video/mp4', extension: 'mp4', providerOperationId: taskId,
      metadata: { taskId, usage: providerUsage, durationSeconds: result.duration, resolution: result.resolution, ratio: result.ratio, fps: result.fps, audio: result.audio },
      billing: { actualCostUsd, quantity: completionTokens || 0, unit: 'video_token', unitPriceUsd: unitPriceUsd / 1_000_000, source: completionTokens > 0 ? 'provider_usage' : 'catalog', providerUsage },
    };
  }

  private async request(path: string, init: RequestInit = {}) {
    const baseUrl = (process.env.BYTEPLUS_ARK_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const apiKey = process.env.BYTEPLUS_ARK_API_KEY ?? process.env.ARK_API_KEY!;
    const response = await safeFetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok) throw new BadGatewayException(payload?.error?.message || payload?.message || `ModelArk API returned ${response.status}.`);
    return payload;
  }
}

function dataUrl(asset: MediaGenerateRequest['inputs'][number]) {
  if (asset.url) return asset.url;
  if (asset.buffer.byteLength > 50 * 1024 * 1024) throw new BadRequestException(`${asset.name} is too large for an inline provider reference.`);
  return `data:${asset.mimeType};base64,${asset.buffer.toString('base64')}`;
}

function safeUsage(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function downloadProviderOutput(url: string, maxBytes: number) {
  const response = await safeFetch(url);
  if (!response.ok) throw new BadGatewayException(`Could not download provider output (${response.status}).`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new BadRequestException('Provider output exceeds the supported size.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new BadRequestException('Provider output exceeds the supported size.');
  return { buffer };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
