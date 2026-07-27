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
    consumeState: jest.fn().mockResolvedValue({
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
    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize');
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
    expect(
      (tokenRequest.init?.headers as Record<string, string>).Authorization,
    ).toBe(`Basic ${Buffer.from('x-client:x-secret').toString('base64')}`);
    const body = new URLSearchParams(String(tokenRequest.init?.body));
    expect(body.get('code_verifier')).toBe('verifier');
    expect(body.has('client_id')).toBe(false);
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

describe('OAuthFlowService GitHub OAuth', () => {
  const provider = {
    providerId: 'provider-github',
    providerKey: 'github',
    displayName: 'GitHub',
    isActive: true,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    revokeUrl: 'https://api.github.com/applications/{client_id}/token',
    userInfoUrl: 'https://api.github.com/user',
    clientId: 'github-client',
    scopes: { default: ['read:user', 'user:email'] },
    authorizationParams: {},
    tokenParams: {},
  };
  const providerService = {
    getProvider: jest.fn().mockResolvedValue(provider),
    getProviderById: jest.fn().mockResolvedValue(provider),
    getDecryptedClientSecret: jest.fn().mockResolvedValue('github-secret'),
  };
  const connectionService = {
    createConnection: jest
      .fn()
      .mockResolvedValue({ connectionId: 'connection-github' }),
    getConnection: jest.fn().mockResolvedValue({
      connectionId: 'connection-github',
      providerId: 'provider-github',
      status: 'active',
    }),
    getDecryptedTokens: jest.fn().mockResolvedValue({
      accessToken: 'github-access',
    }),
    deleteConnection: jest.fn().mockResolvedValue(undefined),
  };
  const stateService = {
    consumeState: jest.fn().mockResolvedValue({
      ownerId: 'user-1',
      providerId: 'provider-github',
      redirectUri: 'https://staging.agentcommons.io/api/oauth/callback/github',
      requestedScopes: ['read:user', 'user:email', 'repo'],
    }),
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

  it('stores a GitHub OAuth App token without inventing a refresh token and resolves a private primary email', async () => {
    global.fetch = jest.fn(async (url: any) => {
      if (String(url).includes('/login/oauth/access_token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'github-access',
            scope: 'read:user,user:email,repo',
            token_type: 'bearer',
          }),
        } as any;
      }
      if (String(url).endsWith('/user/emails')) {
        return {
          ok: true,
          json: async () => [
            {
              email: 'octocat@github.test',
              primary: true,
              verified: true,
            },
          ],
        } as any;
      }
      return {
        ok: true,
        json: async () => ({ id: 1, login: 'octocat', email: null }),
      } as any;
    }) as any;

    await service.handleCallback({
      code: 'authorization-code',
      state: 'state-github',
      redirectUri: 'https://ignored.example/callback',
    });

    expect(connectionService.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'github-access',
        refreshToken: undefined,
        providerUserId: '1',
        providerUserName: 'octocat',
        providerUserEmail: 'octocat@github.test',
      }),
    );
  });

  it('rejects a callback route that does not match the provider in state before exchanging the code', async () => {
    global.fetch = jest.fn() as any;

    await expect(
      service.handleCallback({
        code: 'authorization-code',
        state: 'state-github',
        redirectUri: 'https://ignored.example/callback',
        expectedProviderKey: 'slack',
      }),
    ).rejects.toThrow('OAuth callback provider does not match state');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(connectionService.createConnection).not.toHaveBeenCalled();
  });

  it('revokes a GitHub token through the OAuth application endpoint before deleting locally', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 204 })) as any;

    await service.revokeToken('connection-github');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/applications/github-client/token',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from(
            'github-client:github-secret',
          ).toString('base64')}`,
        }),
        body: JSON.stringify({ access_token: 'github-access' }),
      }),
    );
    expect(connectionService.deleteConnection).toHaveBeenCalledWith(
      'connection-github',
    );
  });
});

describe('OAuthFlowService token recovery', () => {
  const provider = {
    providerId: 'provider-slack',
    providerKey: 'slack',
    clientId: 'slack-client',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    tokenParams: {},
  };
  const providerService = {
    getProviderById: jest.fn().mockResolvedValue(provider),
    getDecryptedClientSecret: jest.fn().mockResolvedValue('slack-secret'),
  };
  const connectionService = {
    withRefreshLock: jest.fn(
      async (_id: string, operation: () => Promise<any>) => operation(),
    ),
    getConnection: jest.fn().mockResolvedValue({
      connectionId: 'connection-slack',
      providerId: 'provider-slack',
      status: 'error',
      accessTokenExpiresAt: new Date(0),
    }),
    getDecryptedTokens: jest.fn().mockResolvedValue({
      accessToken: 'expired-access',
      refreshToken: 'rotating-refresh',
    }),
    updateConnectionTokens: jest.fn().mockResolvedValue(undefined),
    recordError: jest.fn().mockResolvedValue(undefined),
  };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('allows an error connection with a refresh token to recover', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        access_token: 'fresh-access',
        refresh_token: 'rotated-refresh',
        expires_in: 43_200,
      }),
    })) as any;
    const service = new OAuthFlowService(
      providerService as any,
      connectionService as any,
      {} as any,
    );

    await expect(
      service.refreshAccessToken('connection-slack'),
    ).resolves.toMatchObject({ accessToken: 'fresh-access' });

    expect(connectionService.getDecryptedTokens).toHaveBeenCalledWith(
      'connection-slack',
      { allowInactive: true },
    );
    expect(connectionService.updateConnectionTokens).toHaveBeenCalledWith(
      'connection-slack',
      expect.objectContaining({
        accessToken: 'fresh-access',
        refreshToken: 'rotated-refresh',
      }),
    );
  });
});
