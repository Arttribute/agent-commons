import {
  actualMediaCostFromUsage,
  estimateMediaCost,
  getMediaModel,
  isMediaModelPriceConfigured,
  MEDIA_MODEL_REGISTRY,
  mediaUnitPrice,
} from './media-model.registry';

describe('media model registry', () => {
  const originalKlingOverride = process.env.KLING_MEDIA_PRICE_USD_JSON;

  afterEach(() => {
    if (originalKlingOverride === undefined) {
      delete process.env.KLING_MEDIA_PRICE_USD_JSON;
    } else {
      process.env.KLING_MEDIA_PRICE_USD_JSON = originalKlingOverride;
    }
  });

  it('uses stable model keys when an upstream model id spans media kinds', () => {
    const image = getMediaModel('kling', 'kling:image:kling-v3-omni');
    const video = getMediaModel('kling', 'kling:video:kling-v3-omni');

    expect(image.kind).toBe('image');
    expect(video.kind).toBe('video');
    expect(image.modelId).toBe(video.modelId);
    expect(() => getMediaModel('kling', 'kling-v3-omni')).toThrow(
      'Unsupported or ambiguous',
    );
  });

  it('contains only unique Commons model keys', () => {
    const keys = MEDIA_MODEL_REGISTRY.map((model) => model.modelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('quotes GPT Image 2 from the selected quality and aspect ratio', () => {
    const model = getMediaModel('openai', 'openai:image:gpt-image-2');

    expect(
      estimateMediaCost(
        model,
        'create a product image',
        { quality: 'high', aspectRatio: '3:2' },
        [],
      ),
    ).toBe(0.33);
    expect(model.pricing.settlement).toBe('provider_usage');
  });

  it('keeps legacy Sora models visibly time-bounded and priced per second', () => {
    const model = getMediaModel('openai', 'openai:video:sora-2-pro');

    expect(model.badges).toContain('retires 24 Sep 2026');
    expect(
      estimateMediaCost(model, 'create a video', { durationSeconds: 8 }, []),
    ).toBeCloseTo(2.4);
  });

  it('includes OpenAI text and output-audio token costs in TTS quotes', () => {
    const model = getMediaModel(
      'openai',
      'openai:audio:gpt-4o-mini-tts',
    );
    const prompt = 'A'.repeat(60);

    expect(estimateMediaCost(model, prompt, {}, [])).toBeCloseTo(
      4 * 25 * 0.000012 + (15 * 0.6) / 1_000_000,
    );
  });

  it('prices Kling video by duration, resolution, audio, and video input', () => {
    const model = getMediaModel('kling', 'kling:video:kling-v3-omni');

    expect(
      mediaUnitPrice(
        model,
        { resolution: '1080p', nativeAudio: false },
        ['video'],
      ),
    ).toBe(0.168);
    expect(
      estimateMediaCost(
        model,
        'continue this shot',
        { resolution: '1080p', nativeAudio: false, durationSeconds: 10 },
        ['video'],
      ),
    ).toBeCloseTo(1.68);
  });

  it('reconciles Seedance estimates against provider completion tokens', () => {
    const model = getMediaModel(
      'byteplus',
      'byteplus:video:dreamina-seedance-2-0-260128',
    );

    expect(
      actualMediaCostFromUsage(
        model,
        { completionTokens: 250_000, unitPriceUsd: 7 },
        99,
      ),
    ).toBe(1.75);
  });

  it('keeps price-gated models unavailable until an explicit override exists', () => {
    const model = getMediaModel('kling', 'kling:image:kling-image-o1');
    delete process.env.KLING_MEDIA_PRICE_USD_JSON;
    expect(isMediaModelPriceConfigured(model)).toBe(false);

    process.env.KLING_MEDIA_PRICE_USD_JSON = JSON.stringify({
      [model.modelKey]: 0.08,
    });
    expect(isMediaModelPriceConfigured(model)).toBe(true);
    expect(estimateMediaCost(model, 'create an image', {}, [])).toBe(0.08);
  });
});
