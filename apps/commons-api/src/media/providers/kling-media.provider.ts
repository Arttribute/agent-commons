import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { safeFetch } from '~/utils/safe-fetch';
import { estimateMediaCost, mediaUnitPrice } from '../media-model.registry';
import type { MediaGenerateRequest, MediaProviderAdapter, MediaProviderOutput } from '../media.types';

const DEFAULT_BASE_URL = 'https://api-singapore.klingai.com';

@Injectable()
export class KlingMediaProvider implements MediaProviderAdapter {
  readonly id = 'kling';

  supports(modelId: string) {
    return /^kling-/.test(modelId);
  }

  async generate(input: MediaGenerateRequest): Promise<MediaProviderOutput> {
    const accessKey = process.env.KLING_ACCESS_KEY;
    const secretKey = process.env.KLING_SECRET_KEY;
    if (!accessKey || !secretKey) throw new ServiceUnavailableException('Kling media generation is not configured on this environment.');
    const token = signKlingJwt(accessKey, secretKey);
    return input.model.kind === 'image' ? this.image(input, token) : this.video(input, token);
  }

  private async image(input: MediaGenerateRequest, token: string): Promise<MediaProviderOutput> {
    const path = '/v1/images/omni-image';
    const created = await this.request(path, token, {
      method: 'POST',
      body: JSON.stringify({
        model_name: input.model.modelId,
        prompt: input.prompt,
        image_list: input.inputs.map((asset) => ({ image: providerReference(asset) })),
        resolution: String(input.settings.imageSize ?? '2k').toLowerCase(),
        aspect_ratio: String(input.settings.aspectRatio ?? 'auto'),
        n: 1,
        watermark_info: { enabled: false },
      }),
    });
    const taskId = taskIdOf(created);
    const result = await this.poll(`${path}/${encodeURIComponent(taskId)}`, token, taskId, input);
    const url = result.data?.task_result?.images?.[0]?.url ?? result.data?.task_result?.series_images?.[0]?.url;
    if (!url) throw new BadGatewayException('Kling returned no generated image.');
    const downloaded = await downloadProviderOutput(url, 25 * 1024 * 1024);
    const actualCostUsd = estimateMediaCost(input.model, input.prompt, input.settings, input.inputs.map((asset) => asset.kind));
    return {
      buffer: downloaded.buffer,
      mimeType: downloaded.mimeType.startsWith('image/') ? downloaded.mimeType : 'image/png',
      extension: downloaded.mimeType.includes('jpeg') ? 'jpg' : 'png',
      providerOperationId: taskId,
      metadata: { taskId, requestId: result.request_id, finalUnitDeduction: result.data?.final_unit_deduction, finalBalanceDeduction: result.data?.final_balance_deduction },
      billing: {
        actualCostUsd, quantity: 1, unit: 'image', unitPriceUsd: actualCostUsd, source: 'catalog',
        providerUsage: { finalUnitDeduction: result.data?.final_unit_deduction, finalBalanceDeduction: result.data?.final_balance_deduction },
      },
    };
  }

  private async video(input: MediaGenerateRequest, token: string): Promise<MediaProviderOutput> {
    const omni = input.model.modelId.includes('omni') || input.model.modelId.includes('o1') || input.inputs.some((asset) => asset.kind === 'video');
    const path = omni ? '/v1/videos/omni-video' : input.inputs.length ? '/v1/videos/image2video' : '/v1/videos/text2video';
    const images = input.inputs.filter((asset) => asset.mimeType.startsWith('image/'));
    const videos = input.inputs.filter((asset) => asset.mimeType.startsWith('video/'));
    const common = {
      model_name: input.model.modelId,
      prompt: input.prompt,
      duration: String(input.settings.durationSeconds ?? 5),
      aspect_ratio: String(input.settings.aspectRatio ?? '16:9'),
      resolution: String(input.settings.resolution ?? '1080p').replace('p', ''),
      sound: Boolean(input.settings.nativeAudio) ? 'on' : 'off',
      watermark_info: { enabled: false },
    };
    const body = omni
      ? {
          ...common,
          image_list: images.map((asset) => ({ image: providerReference(asset) })),
          video_list: videos.map((asset) => ({ video: providerReference(asset) })),
        }
      : images[0]
        ? { ...common, image: providerReference(images[0]), tail_image: images[1] ? providerReference(images[1]) : undefined }
        : common;
    const created = await this.request(path, token, { method: 'POST', body: JSON.stringify(body) });
    const taskId = taskIdOf(created);
    const result = await this.poll(`${path}/${encodeURIComponent(taskId)}`, token, taskId, input);
    const video = result.data?.task_result?.videos?.[0];
    if (!video?.url) throw new BadGatewayException('Kling returned no generated video.');
    const downloaded = await downloadProviderOutput(video.url, 500 * 1024 * 1024);
    const inputKinds = input.inputs.map((asset) => asset.kind);
    const seconds = Number(video.duration ?? input.settings.durationSeconds ?? 5);
    const unitPriceUsd = mediaUnitPrice(input.model, input.settings, inputKinds);
    const actualCostUsd = unitPriceUsd * seconds;
    return {
      buffer: downloaded.buffer, mimeType: 'video/mp4', extension: 'mp4', providerOperationId: taskId,
      metadata: { taskId, requestId: result.request_id, durationSeconds: seconds, finalUnitDeduction: result.data?.final_unit_deduction, finalBalanceDeduction: result.data?.final_balance_deduction },
      billing: {
        actualCostUsd, quantity: seconds, unit: 'second', unitPriceUsd, source: 'catalog',
        providerUsage: { durationSeconds: seconds, finalUnitDeduction: result.data?.final_unit_deduction, finalBalanceDeduction: result.data?.final_balance_deduction },
      },
    };
  }

  private async poll(path: string, token: string, taskId: string, input: MediaGenerateRequest) {
    for (let poll = 0; poll < 180; poll += 1) {
      if (poll) await delay(5_000);
      const result = await this.request(path, token);
      const status = String(result.data?.task_status ?? '').toLowerCase();
      await input.onProgress?.(Math.min(92, 8 + poll * 3), taskId);
      if (status === 'succeed') return result;
      if (status === 'failed') throw new BadGatewayException(result.data?.task_status_msg || 'Kling generation failed.');
    }
    throw new BadGatewayException('Kling generation timed out.');
  }

  private async request(path: string, token: string, init: RequestInit = {}) {
    const baseUrl = (process.env.KLING_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const response = await safeFetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok || payload?.code !== 0) throw new BadGatewayException(payload?.message || `Kling API returned ${response.status}.`);
    return payload;
  }
}

function taskIdOf(payload: any) {
  const taskId = payload?.data?.task_id;
  if (!taskId) throw new BadGatewayException('Kling returned no task identifier.');
  return String(taskId);
}

async function downloadProviderOutput(url: string, maxBytes: number) {
  const response = await safeFetch(url);
  if (!response.ok) throw new BadGatewayException(`Could not download provider output (${response.status}).`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new BadRequestException('Provider output exceeds the supported size.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new BadRequestException('Provider output exceeds the supported size.');
  return { buffer, mimeType: response.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream' };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerReference(asset: MediaGenerateRequest['inputs'][number]) {
  return asset.url ?? asset.buffer.toString('base64');
}

function signKlingJwt(accessKey: string, secretKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ iss: accessKey, nbf: now - 5, exp: now + 1800 }),
  ).toString('base64url');
  const signature = createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}
