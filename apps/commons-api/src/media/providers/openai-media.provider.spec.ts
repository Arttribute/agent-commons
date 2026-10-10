import { getMediaModel } from '../media-model.registry';
import { OpenAIMediaProvider } from './openai-media.provider';

describe('current OpenAI image provider', () => {
  it.each(['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'])('sends %s unchanged and settles reported input/output usage', async (id) => {
    const bytes = Buffer.from('actual provider image bytes');
    const response = { data: [{ b64_json: bytes.toString('base64') }], usage: { input_tokens: 120, input_tokens_details: { text_tokens: 100, image_tokens: 20 }, output_tokens: 1000 } };
    const client = { images: { generate: jest.fn().mockResolvedValue(response), edit: jest.fn().mockResolvedValue(response) } };
    const provider = new OpenAIMediaProvider();
    const request = { model: getMediaModel('openai', `openai:image:${id}`), prompt: 'Offline campaign', settings: { aspectRatio: 'auto', quality: 'high' }, inputs: [] };
    const output = await (provider as any).image(client, request);
    expect(client.images.generate).toHaveBeenCalledWith(expect.objectContaining({ model: id, size: 'auto', quality: 'high', output_format: 'png' }));
    expect(output.buffer).toEqual(bytes);
    expect(output.billing.actualCostUsd).toBeCloseTo(0.03066);
    expect(output.billing.source).toBe('provider_usage');
    expect(client.images.edit).not.toHaveBeenCalled();
    await (provider as any).image(client, { ...request, inputs: [{ buffer: Buffer.from('reference bytes'), name: 'reference.png', mimeType: 'image/png', kind: 'image' }] });
    expect(client.images.edit).toHaveBeenCalledWith(expect.objectContaining({ model: id, image: expect.arrayContaining([expect.objectContaining({ name: 'reference.png' })]) }));
  });
});
