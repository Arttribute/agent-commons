import { BadRequestException } from '@nestjs/common';
import type { MediaModelDescriptor, MediaSettingField } from './media.types';

const GOOGLE_PRICING = 'https://ai.google.dev/gemini-api/docs/pricing';
const KLING_PRICING = 'https://kling.ai/document-api/productBilling/billingMethod';
const BYTEPLUS_PRICING = 'https://docs.byteplus.com/docs/ModelArk/1099320';
const OPENAI_PRICING = 'https://developers.openai.com/api/docs/pricing';
const OPENAI_SORA_DOCS = 'https://developers.openai.com/api/reference/typescript/resources/videos/methods/create';

const options = (values: string[]) => values.map((value) => ({ label: value, value }));
const ASPECT_RATIOS = options(['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '16:9', '9:16', '21:9']);
const aspect = (allowed = ASPECT_RATIOS): MediaSettingField => ({ key: 'aspectRatio', label: 'Aspect ratio', type: 'select', default: allowed[0]?.value ?? '1:1', options: allowed });
const resolution = (values: string[], initial = values[0]): MediaSettingField => ({ key: 'resolution', label: 'Resolution', type: 'select', default: initial, options: options(values) });
const duration = (values: number[], initial = values[0]): MediaSettingField => ({ key: 'durationSeconds', label: 'Duration', type: 'select', default: String(initial), options: values.map((value) => ({ label: `${value} seconds`, value: String(value) })) });
const nativeAudio: MediaSettingField = { key: 'nativeAudio', label: 'Native audio', type: 'boolean', default: true, help: 'Generate synchronized audio with the video.' };

const GOOGLE_IMAGE_SETTINGS: MediaSettingField[] = [
  aspect(ASPECT_RATIOS.filter((value) => value.value !== 'auto')),
  { key: 'imageSize', label: 'Resolution', type: 'select', default: '1K', options: options(['0.5K', '1K', '2K', '4K']) },
];
const GOOGLE_VIDEO_SETTINGS: MediaSettingField[] = [aspect(options(['16:9', '9:16'])), duration([4, 6, 8], 8), resolution(['720p', '1080p', '4k'], '720p')];
const KLING_VIDEO_SETTINGS: MediaSettingField[] = [aspect(options(['16:9', '9:16', '1:1'])), duration([5, 10, 15], 5), resolution(['720p', '1080p', '4k'], '1080p'), nativeAudio];
const SEEDANCE_SETTINGS: MediaSettingField[] = [
  aspect(options(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'])), duration([4, 5, 8, 10, 12], 5), resolution(['480p', '720p', '1080p', '4k'], '720p'),
  { key: 'fps', label: 'Frame rate', type: 'select', default: '24', options: options(['24']) },
  { key: 'generateAudio', label: 'Generate audio', type: 'boolean', default: true },
  { key: 'cameraFixed', label: 'Fixed camera', type: 'boolean', default: false },
];

const fixedPrice = (unit: MediaModelDescriptor['pricing']['unit'], usd: number, note: string, sourceUrl: string, extra: Partial<MediaModelDescriptor['pricing']> = {}): MediaModelDescriptor['pricing'] => ({ unit, usd, note, sourceUrl, settlement: 'catalog', ...extra });
const usagePrice = (unit: MediaModelDescriptor['pricing']['unit'], usd: number, note: string, sourceUrl: string, extra: Partial<MediaModelDescriptor['pricing']> = {}): MediaModelDescriptor['pricing'] => ({ unit, usd, note, sourceUrl, settlement: 'provider_usage', ...extra });

const openaiModels: MediaModelDescriptor[] = [
  {
    modelKey: 'openai:image:gpt-image-2', provider: 'openai', modelId: 'gpt-image-2', displayName: 'GPT Image 2',
    description: 'OpenAI’s current state-of-the-art image generation and reference-based editing model.', kind: 'image', operations: ['generate', 'transform'], inputKinds: ['image'], maxInputs: 16, tier: 'frontier', async: false,
    settings: [
      aspect(options(['1:1', '3:2', '2:3'])),
      { key: 'quality', label: 'Quality', type: 'select', default: 'medium', options: options(['low', 'medium', 'high']) },
      { key: 'background', label: 'Background', type: 'select', default: 'auto', options: options(['auto', 'opaque', 'transparent']) },
    ],
    pricing: usagePrice('request', 0.06, 'authorization estimate; final charge reconciles text/image input and image output tokens', OPENAI_PRICING, {
      variants: {
        'low:1024x1024': 0.02, 'low:1536x1024': 0.03, 'low:1024x1536': 0.03,
        'medium:1024x1024': 0.06, 'medium:1536x1024': 0.09, 'medium:1024x1536': 0.09,
        'high:1024x1024': 0.22, 'high:1536x1024': 0.33, 'high:1024x1536': 0.33,
      },
    }),
    badges: ['OpenAI', 'current', 'edits', 'transparent PNG'],
  },
  {
    modelKey: 'openai:audio:gpt-4o-mini-tts', provider: 'openai', modelId: 'gpt-4o-mini-tts', displayName: 'GPT-4o mini TTS',
    description: 'Natural, instruction-guided text-to-speech.', kind: 'audio', operations: ['generate'], inputKinds: [], maxInputs: 0, tier: 'fast', async: false,
    settings: [
      { key: 'voice', label: 'Voice', type: 'select', default: 'coral', options: options(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']) },
      { key: 'instructions', label: 'Delivery', type: 'text', default: 'Speak clearly and naturally.' },
      { key: 'format', label: 'Format', type: 'select', default: 'mp3', options: options(['mp3', 'wav', 'aac', 'opus']) },
    ],
    pricing: fixedPrice('audio_token', 0.000012, '$12 per 1M output audio tokens plus $0.60 per 1M input text tokens', OPENAI_PRICING),
    badges: ['OpenAI', 'instruction guided'],
  },
  ...[
    ['sora-2', 'Sora 2', 'Legacy video generation with synchronized audio.', 'standard', 0.1],
    ['sora-2-pro', 'Sora 2 Pro', 'Legacy higher-fidelity video generation with synchronized audio.', 'frontier', 0.3],
  ].map(([modelId, displayName, description, tier, usd]) => ({
    modelKey: `openai:video:${modelId}`, provider: 'openai', modelId: String(modelId), displayName: String(displayName), description: String(description), kind: 'video' as const,
    operations: ['generate'] as ('generate')[], inputKinds: [] as MediaModelDescriptor['inputKinds'], maxInputs: 0, tier: tier as MediaModelDescriptor['tier'], async: true,
    settings: [aspect(options(['16:9', '9:16'])), duration([4, 8, 12], 8), resolution(['720p'], '720p')],
    pricing: fixedPrice('second', Number(usd), 'per generated second at 720p; API retires September 24, 2026', OPENAI_SORA_DOCS),
    badges: ['OpenAI', 'native audio', 'retires 24 Sep 2026'],
  })),
];

const googleModels: MediaModelDescriptor[] = [
  {
    modelKey: 'google:image:gemini-3.1-flash-lite-image', provider: 'google', modelId: 'gemini-3.1-flash-lite-image', displayName: 'Nano Banana 2 Lite',
    description: 'Fast, cost-efficient image generation and editing.', kind: 'image', operations: ['generate', 'transform'], inputKinds: ['image'], maxInputs: 14, tier: 'fast', async: false,
    settings: GOOGLE_IMAGE_SETTINGS.filter((field) => field.key !== 'imageSize'), pricing: fixedPrice('image', 0.0336, '1K image, standard tier', GOOGLE_PRICING), badges: ['SynthID', '1K'],
  },
  {
    modelKey: 'google:image:gemini-3.1-flash-image', provider: 'google', modelId: 'gemini-3.1-flash-image', displayName: 'Nano Banana 2',
    description: 'High-quality image creation, references, and edits.', kind: 'image', operations: ['generate', 'transform'], inputKinds: ['image'], maxInputs: 14, tier: 'standard', async: false,
    settings: GOOGLE_IMAGE_SETTINGS, pricing: fixedPrice('image', 0.067, '1K image, standard tier', GOOGLE_PRICING), badges: ['SynthID', 'up to 4K'],
  },
  {
    modelKey: 'google:image:gemini-3-pro-image', provider: 'google', modelId: 'gemini-3-pro-image', displayName: 'Nano Banana Pro',
    description: 'Precision control, text rendering, and brand consistency.', kind: 'image', operations: ['generate', 'transform'], inputKinds: ['image'], maxInputs: 14, tier: 'frontier', async: false,
    settings: GOOGLE_IMAGE_SETTINGS, pricing: fixedPrice('image', 0.134, '1K/2K image, standard tier', GOOGLE_PRICING), badges: ['SynthID', 'up to 4K'],
  },
  ...[
    ['veo-3.1-lite-generate-preview', 'Veo 3.1 Lite', 'Fast generation and image-to-video with native audio.', 'fast', 0.05],
    ['veo-3.1-fast-generate-preview', 'Veo 3.1 Fast', 'High-speed cinematic generation with native audio.', 'standard', 0.1],
    ['veo-3.1-generate-preview', 'Veo 3.1', 'Premium cinematic generation with advanced controls.', 'frontier', 0.4],
  ].map(([modelId, displayName, description, tier, usd]) => ({
    modelKey: `google:video:${modelId}`, provider: 'google', modelId: String(modelId), displayName: String(displayName), description: String(description), kind: 'video' as const,
    operations: ['generate', 'transform'] as ('generate' | 'transform')[], inputKinds: ['image'] as ('image')[], maxInputs: 2, tier: tier as MediaModelDescriptor['tier'], async: true,
    settings: String(modelId).includes('lite') ? GOOGLE_VIDEO_SETTINGS.map((field) => field.key === 'resolution' ? resolution(['720p', '1080p'], '720p') : field) : GOOGLE_VIDEO_SETTINGS,
    pricing: fixedPrice('second', Number(usd), 'per generated second with audio', GOOGLE_PRICING), badges: ['native audio', ...(String(modelId).includes('lite') ? [] : ['up to 4K'])],
  })),
  {
    modelKey: 'google:audio:gemini-3.1-flash-tts-preview', provider: 'google', modelId: 'gemini-3.1-flash-tts-preview', displayName: 'Gemini 3.1 Speech',
    description: 'Controllable speech with voice, style, pacing, and tone.', kind: 'audio', operations: ['generate'], inputKinds: [], maxInputs: 0, tier: 'standard', async: false,
    settings: [{ key: 'voice', label: 'Voice', type: 'select', default: 'Kore', options: options(['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr']) }],
    pricing: fixedPrice('audio_token', 0.00002, '$20 per 1M output audio tokens; about 25 tokens/second', GOOGLE_PRICING),
  },
  ...[
    ['lyria-3-clip-preview', 'Lyria 3 Clip', 'Thirty-second musical clips, loops, and previews.', 'fast', 0.04],
    ['lyria-3-pro-preview', 'Lyria 3 Pro', 'Full-length music with coherent structure and image guidance.', 'frontier', 0.08],
  ].map(([modelId, displayName, description, tier, usd]) => ({
    modelKey: `google:music:${modelId}`, provider: 'google', modelId: String(modelId), displayName: String(displayName), description: String(description), kind: 'music' as const,
    operations: ['generate'] as ('generate')[], inputKinds: ['image'] as ('image')[], maxInputs: 1, tier: tier as MediaModelDescriptor['tier'], async: false, settings: [],
    pricing: fixedPrice('request', Number(usd), 'per generation request', GOOGLE_PRICING), badges: ['48 kHz stereo'],
  })),
];

const klingVideoModels: MediaModelDescriptor[] = [
  ['kling-v3-turbo', 'Kling 3.0 Turbo', 'Fast native-audio video generation.', 'fast', { '720p:audio': 0.112, '1080p:audio': 0.14 }],
  ['kling-v3', 'Kling 3.0', 'Cinematic video, multi-shot narratives, and native audio.', 'frontier', { '720p:silent': 0.084, '1080p:silent': 0.112, '4k:silent': 0.42, '720p:audio': 0.126, '1080p:audio': 0.168, '4k:audio': 0.42 }],
  ['kling-v3-omni', 'Kling 3.0 Omni', 'Multimodal image/video references, elements, storyboards, and audio.', 'frontier', { '720p:silent': 0.084, '1080p:silent': 0.112, '4k:silent': 0.42, '720p:audio': 0.112, '1080p:audio': 0.14, '4k:audio': 0.42, '720p:video:silent': 0.126, '1080p:video:silent': 0.168, '4k:video:silent': 0.42 }],
  ['kling-video-o1', 'Kling Video O1', 'Unified instruction-based generation and video transformation.', 'frontier', { '720p:silent': 0.084, '1080p:silent': 0.112, '720p:video:silent': 0.126, '1080p:video:silent': 0.168 }],
  ['kling-v2-6', 'Kling 2.6', 'Production video generation with optional native audio.', 'standard', { '720p:silent': 0.042, '1080p:silent': 0.07, '1080p:audio': 0.14 }],
  ['kling-v2-5-turbo', 'Kling 2.5 Turbo', 'Efficient silent video generation.', 'fast', { '720p:silent': 0.042, '1080p:silent': 0.07 }],
].map(([modelId, displayName, description, tier, variants]) => ({
  modelKey: `kling:video:${modelId}`, provider: 'kling', modelId: String(modelId), displayName: String(displayName), description: String(description), kind: 'video' as const,
  operations: ['generate', 'transform'] as ('generate' | 'transform')[], inputKinds: ['image', 'video'] as ('image' | 'video')[], maxInputs: String(modelId).includes('omni') ? 10 : 2,
  tier: tier as MediaModelDescriptor['tier'], async: true,
  settings: String(modelId) === 'kling-v2-5-turbo' ? KLING_VIDEO_SETTINGS.filter((field) => field.key !== 'nativeAudio' && field.key !== 'resolution').concat(resolution(['720p', '1080p'], '1080p')) : KLING_VIDEO_SETTINGS,
  pricing: fixedPrice('second', Math.max(...Object.values(variants as Record<string, number>)), 'per generated second; rate varies by resolution, input, and audio', KLING_PRICING, { variants: variants as Record<string, number> }),
  badges: String(modelId).includes('v3') || String(modelId).includes('2-6') ? ['native audio'] : [],
}));

const klingImageModels: MediaModelDescriptor[] = [
  ['kling-image-o1', 'Kling Image O1', 'Instruction-led image creation and precise multi-reference edits.', 'standard'],
  ['kling-v3-omni', 'Kling Image 3.0 Omni', 'Native 4K image generation, consistent subjects, and series.', 'frontier'],
].map(([modelId, displayName, description, tier]) => ({
  modelKey: `kling:image:${modelId}`, provider: 'kling', modelId: String(modelId), displayName: String(displayName), description: String(description), kind: 'image' as const,
  operations: ['generate', 'transform'] as ('generate' | 'transform')[], inputKinds: ['image'] as ('image')[], maxInputs: 10, tier: tier as MediaModelDescriptor['tier'], async: true,
  settings: [aspect(ASPECT_RATIOS), { key: 'imageSize', label: 'Resolution', type: 'select' as const, default: '2k', options: options(['1k', '2k', '4k']) }],
  pricing: fixedPrice('image', 0, 'Provider tariff must be configured before use', KLING_PRICING, { requiresOverride: true }), badges: ['up to 4K'],
}));

const seedreamModels: MediaModelDescriptor[] = [
  ['dola-seedream-5-0-pro-260628', 'Seedream 5.0 Pro', 'High-precision editing with spatial marks and coordinates.', 'frontier', 0.045, ['1K', '2K']],
  ['seedream-5-0-lite-260128', 'Seedream 5.0 Lite', 'Fast generation, multi-reference fusion, and image sequences.', 'fast', 0.035, ['2K', '3K', '4K']],
  ['seedream-4-5-251128', 'Seedream 4.5', 'High-quality text-to-image and multi-image reference generation.', 'standard', 0.04, ['2K', '4K']],
  ['seedream-4-0-250828', 'Seedream 4.0', 'Flexible image creation and editing up to 4K.', 'standard', 0.03, ['1K', '2K', '4K']],
].map(([modelId, displayName, description, tier, usd, sizes]) => ({
  modelKey: `byteplus:image:${modelId}`, provider: 'byteplus', modelId: String(modelId), displayName: String(displayName), description: String(description), kind: 'image' as const,
  operations: ['generate', 'transform'] as ('generate' | 'transform')[], inputKinds: ['image'] as ('image')[], maxInputs: 14, tier: tier as MediaModelDescriptor['tier'], async: false,
  settings: [aspect(ASPECT_RATIOS.filter((value) => value.value !== 'auto')), { key: 'imageSize', label: 'Resolution', type: 'select' as const, default: (sizes as string[])[0], options: options(sizes as string[]) }],
  pricing: fixedPrice('image', Number(usd), 'per successfully generated image', BYTEPLUS_PRICING, String(modelId).includes('pro') ? { variants: { standard: 0.045, high_pixels: 0.09 } } : {}),
  badges: [`up to ${(sizes as string[]).at(-1)}`],
}));

const seedanceModels: MediaModelDescriptor[] = [
  ['dreamina-seedance-2-5-260628', 'Seedance 2.5', 'Latest multimodal video generation and transformation.', 'frontier', 0, true],
  ['dreamina-seedance-2-0-260128', 'Seedance 2.0', 'Multimodal video with images, video, audio, and synchronized output.', 'frontier', 7, false],
  ['dreamina-seedance-2-0-fast-260128', 'Seedance 2.0 Fast', 'Faster multimodal video generation.', 'fast', 5.6, false],
  ['dreamina-seedance-2-0-mini-260615', 'Seedance 2.0 Mini', 'Cost-efficient multimodal video generation.', 'fast', 3.5, false],
  ['seedance-1-5-pro-251215', 'Seedance 1.5 Pro', 'High-quality video with optional generated audio.', 'standard', 2.4, false],
  ['seedance-1-0-pro-250528', 'Seedance 1.0 Pro', 'Professional silent video generation.', 'standard', 2.5, false],
  ['seedance-1-0-pro-fast-251015', 'Seedance 1.0 Pro Fast', 'Fast, economical silent video generation.', 'fast', 1, false],
].map(([modelId, displayName, description, tier, usd, requiresOverride]) => ({
  modelKey: `byteplus:video:${modelId}`, provider: 'byteplus', modelId: String(modelId), displayName: String(displayName), description: String(description), kind: 'video' as const,
  operations: ['generate', 'transform'] as ('generate' | 'transform')[], inputKinds: ['image', 'video', 'audio'] as ('image' | 'video' | 'audio')[], maxInputs: String(modelId).includes('2-') ? 12 : 1,
  tier: tier as MediaModelDescriptor['tier'], async: true, settings: SEEDANCE_SETTINGS,
  pricing: usagePrice('million_video_tokens', Number(usd), 'per 1M successfully generated video tokens; final charge uses provider completion_tokens', BYTEPLUS_PRICING, {
    requiresOverride: Boolean(requiresOverride), variants: String(modelId).includes('2-0') ? { standard: Number(usd), video_input: Number(usd) * 0.61 } : undefined,
  }),
  badges: ['usage reconciled', ...(String(modelId).includes('2-') ? ['multimodal'] : [])],
}));

/** A provider-neutral catalog drives Canvas, agent tools, workflows, pricing, and provenance. */
export const MEDIA_MODEL_REGISTRY: MediaModelDescriptor[] = [...openaiModels, ...googleModels, ...klingVideoModels, ...klingImageModels, ...seedreamModels, ...seedanceModels];

export function getMediaModel(provider: string, selector: string, kind?: string) {
  const byKey = MEDIA_MODEL_REGISTRY.find((entry) => entry.provider === provider && entry.modelKey === selector);
  const matches = MEDIA_MODEL_REGISTRY.filter((entry) => entry.provider === provider && entry.modelId === selector && (!kind || entry.kind === kind));
  const model = byKey ?? (matches.length === 1 ? matches[0] : undefined);
  if (!model) throw new BadRequestException(`Unsupported or ambiguous media model "${selector}"`);
  return model;
}

export function mediaPriceOverride(model: MediaModelDescriptor) {
  const envName = `${model.provider.toUpperCase()}_MEDIA_PRICE_USD_JSON`;
  const value = safePriceOverride(process.env[envName], model.modelKey, model.modelId);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function isMediaModelPriceConfigured(model: MediaModelDescriptor) {
  return !model.pricing.requiresOverride || Boolean(mediaPriceOverride(model));
}

export function estimateMediaCost(model: MediaModelDescriptor, prompt: string, settings: Record<string, unknown>, inputKinds: string[] = []) {
  const override = mediaPriceOverride(model);
  const unitPrice = override ?? selectUnitPrice(model, settings, inputKinds);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return NaN;
  if (model.pricing.unit === 'second') return unitPrice * clampNumber(settings.durationSeconds, 1, 30, 5);
  if (model.pricing.unit === 'million_video_tokens') {
    const [width, height] = videoDimensions(String(settings.resolution ?? '720p'), String(settings.aspectRatio ?? '16:9'));
    const outputTokens = (width * height * clampNumber(settings.fps, 1, 120, 24) * clampNumber(settings.durationSeconds, 1, 60, 5)) / 1024;
    return (outputTokens / 1_000_000) * unitPrice;
  }
  if (model.pricing.unit === 'audio_token') {
    const seconds = Math.max(1, prompt.length / 15);
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    return seconds * 25 * unitPrice + (estimatedInputTokens * 0.6) / 1_000_000;
  }
  if (model.kind === 'image') {
    if (model.provider === 'openai') {
      const ratio = String(settings.aspectRatio ?? '1:1');
      const size = ratio === '3:2' ? '1536x1024' : ratio === '2:3' ? '1024x1536' : '1024x1024';
      const quality = String(settings.quality ?? 'medium');
      return override ?? model.pricing.variants?.[`${quality}:${size}`] ?? unitPrice;
    }
    const size = String(settings.imageSize ?? settings.resolution ?? '1K').toLowerCase();
    if (model.modelId === 'dola-seedream-5-0-pro-260628' && size === '2k') return (override ?? model.pricing.variants?.high_pixels ?? unitPrice) + Math.max(0, inputKinds.length - 1) * 0.003;
    const multiplier = model.provider === 'google' ? size === '0.5k' ? 0.67 : size === '2k' ? 1.5 : size === '4k' ? 2.25 : 1 : 1;
    return unitPrice * multiplier;
  }
  return unitPrice;
}

export function actualMediaCostFromUsage(model: MediaModelDescriptor, providerUsage: Record<string, unknown> | undefined, fallback: number) {
  const completionTokens = Number(providerUsage?.completionTokens);
  const unitPrice = Number(providerUsage?.unitPriceUsd ?? model.pricing.usd);
  if (model.pricing.unit === 'million_video_tokens' && completionTokens > 0 && unitPrice > 0) return (completionTokens / 1_000_000) * unitPrice;
  return fallback;
}

export function mediaUnitPrice(model: MediaModelDescriptor, settings: Record<string, unknown>, inputKinds: string[] = []) {
  return mediaPriceOverride(model) ?? selectUnitPrice(model, settings, inputKinds);
}

function selectUnitPrice(model: MediaModelDescriptor, settings: Record<string, unknown>, inputKinds: string[]) {
  const variants = model.pricing.variants;
  if (!variants) return model.pricing.usd;
  if (model.pricing.unit === 'million_video_tokens') return inputKinds.includes('video') ? variants.video_input ?? model.pricing.usd : variants.standard ?? model.pricing.usd;
  if (model.pricing.unit === 'second') {
    const resolution = String(settings.resolution ?? '1080p').toLowerCase();
    const audio = Boolean(settings.nativeAudio ?? false) ? 'audio' : 'silent';
    const video = inputKinds.includes('video') ? ':video' : '';
    return variants[`${resolution}${video}:${audio}`] ?? variants[`${resolution}:${audio}`] ?? model.pricing.usd;
  }
  return model.pricing.usd;
}

function safePriceOverride(json: string | undefined, ...keys: string[]) {
  if (!json) return NaN;
  try {
    const values = JSON.parse(json) as Record<string, unknown>;
    for (const key of keys) {
      const value = Number(values[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  } catch { /* invalid policy is treated as unavailable */ }
  return NaN;
}

function videoDimensions(resolutionName: string, ratio: string): [number, number] {
  const long = resolutionName === '4k' ? 3840 : resolutionName === '1080p' ? 1920 : resolutionName === '480p' ? 854 : 1280;
  const short = resolutionName === '4k' ? 2160 : resolutionName === '1080p' ? 1080 : resolutionName === '480p' ? 480 : 720;
  const [left, right] = ratio.split(':').map(Number);
  return !Number.isFinite(left) || !Number.isFinite(right) || left >= right ? [long, short] : [short, long];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
