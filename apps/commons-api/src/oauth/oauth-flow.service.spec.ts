import { OAuthFlowService } from './oauth-flow.service';

describe('OAuthFlowService X OAuth', () => {
  const provider = {
    providerId: 'provider-x',
    providerKey: 'x',
    displayName: 'X (Twitter)',
    isActive: true,
    authUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    userInfoUrl: 'https://api.x.com/2/users/me',
    clientId: 'x-client',
    scopes: {
      default: ['tweet.read', 'users.read', 'offline.access'],
      publish: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    },
    authorizationParams: {},
    tokenParams: {},
  };
  const providerService = {
    getProvider: jest.fn().mockResolvedValue(provider),
    getProviderById: jest.fn().mockResolvedValue(provider),
    getDecryptedClientSecret: jest.fn().mockResolvedValue('x-secret'),
  };
  const connectionService = {
    createConnection: jest
      .fn()
      .mockResolvedValue({ connectionId: 'connection-x' }),
  };
  const stateService = {
    generateCodeVerifier: jest.fn().mockReturnValue('verifier'),
    generateCodeChallenge: jest.fn().mockResolvedValue('challenge'),
    createState: jest.fn().mockResolvedValue({ stateId: 'state-x' }),
    getState: jest.fn().mockResolvedValue({
      ownerId: 'user-1',
      providerId: 'provider-x',
      redirectUri: 'https://staging.agentcommons.io/api/oauth/callback/x',
      requestedScopes: [
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access',
      ],
      codeVerifier: 'verifier',
    }),
    deleteState: jest.fn().mockResolvedValue(undefined),
  };
  const originalFetch = global.fetch;
  let service: OAuthFlowService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OAuthFlowService(
      providerService as any,
      connectionService as any,
      stateService as any,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates an X authorization URL with PKCE and offline access', async () => {
    const result = await service.initiateFlow({
      userId: 'user-1',
      providerKey: 'x',
      requestedScopes: [
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access',
      ],
      redirectUri: 'https://staging.agentcommons.io/api/oauth/callback/x',
    });

    const url = new URL(result.authorizationUrl);
    expect(url.origin + url.pathname).toBe(
      'https://x.com/i/oauth2/authorize',
    );
    expect(url.searchParams.get('scope')).toBe(
      'tweet.read tweet.write users.read offline.access',
    );
    expect(url.searchParams.get('code_challenge')).toBe('challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchanges the code with confidential-client Basic auth and stores the X identity', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(async (url: any, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (String(url).includes('/oauth2/token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'access',
            refresh_token: 'refresh',
            expires_in: 7200,
            scope: 'tweet.read tweet.write users.read offline.access',
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          data: { id: '42', name: 'Agent Commons', username: 'agentcommons' },
        }),
      } as any;
    }) as any;

    await service.handleCallback({
      code: 'authorization-code',
      state: 'state-x',
      redirectUri: 'https://ignored.example/callback',
    });

    const tokenRequest = requests[0];
    expect((tokenRequest.init?.headers as Record<string, string>).Authorization)
      .toBe(`Basic ${Buffer.from('x-client:x-secret').toString('base64')}`);
    const body = new URLSearchParams(String(tokenRequest.init?.body));
    expect(body.get('code_verifier')).toBe('verifier');
    expect(body.has('client_secret')).toBe(false);
    expect(connectionService.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        providerUserId: '42',
        providerUserName: 'agentcommons',
        refreshToken: 'refresh',
      }),
    );
  });
});
