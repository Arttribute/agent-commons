import { OAuthProviderService } from './oauth-provider.service';

describe('OAuthProviderService platform provider sync', () => {
  const envKeys = [
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GITHUB_OAUTH_CLIENT_ID',
    'GITHUB_OAUTH_CLIENT_SECRET',
    'SLACK_OAUTH_CLIENT_ID',
    'SLACK_OAUTH_CLIENT_SECRET',
    'CANVA_OAUTH_CLIENT_ID',
    'CANVA_OAUTH_CLIENT_SECRET',
    'X_OAUTH_CLIENT_ID',
    'X_OAUTH_CLIENT_SECRET',
    'TWITTER_OAUTH_CLIENT_ID',
    'TWITTER_OAUTH_CLIENT_SECRET',
  ] as const;
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of envKeys) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
  });

  it('creates GitHub from runtime credentials with its real revocation endpoint', async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'github-client';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'github-secret';
    const db = {
      query: {
        oauthProvider: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
    };
    const service = new OAuthProviderService(db as any, {} as any);
    const createProvider = jest
      .spyOn(service, 'createProvider')
      .mockResolvedValue({ providerKey: 'github' } as any);

    await service.onModuleInit();

    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: 'github',
        clientId: 'github-client',
        clientSecret: 'github-secret',
        revokeUrl: 'https://api.github.com/applications/{client_id}/token',
      }),
    );
  });

  it('does not publish a half-configured provider', async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'github-client';
    const db = {
      query: {
        oauthProvider: {
          findFirst: jest.fn(),
        },
      },
    };
    const service = new OAuthProviderService(db as any, {} as any);
    const createProvider = jest
      .spyOn(service, 'createProvider')
      .mockResolvedValue({ providerKey: 'github' } as any);

    await service.onModuleInit();

    expect(db.query.oauthProvider.findFirst).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });
});
