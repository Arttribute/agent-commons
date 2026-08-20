import { CapabilityProviderService } from './capability-provider.service';

describe('CapabilityProviderService validation', () => {
  const service = new CapabilityProviderService({} as any, {} as any);

  it.each([
    'http://search.example.com',
    'https://localhost/search',
    'https://127.0.0.1/search',
    'https://10.0.0.4/search',
    'https://192.168.1.8/search',
  ])('rejects unsafe custom endpoints: %s', async (endpointUrl) => {
    await expect(
      service.upsert('user-1', null, 'web_search', {
        provider: 'custom',
        endpointUrl,
      }),
    ).rejects.toThrow();
  });

  it('keeps credentials out of provider settings', async () => {
    await expect(
      service.upsert('user-1', null, 'web_search', {
        provider: 'custom',
        endpointUrl: 'https://search.example.com',
        settings: { apiKey: 'should-not-be-here' },
      }),
    ).rejects.toThrow('Store apiKey in credentials');
  });

  it('rejects unknown capabilities at the API boundary', async () => {
    await expect(
      service.upsert('user-1', null, 'email' as any, {
        provider: 'custom',
      }),
    ).rejects.toThrow('Unsupported capability');
  });
});
