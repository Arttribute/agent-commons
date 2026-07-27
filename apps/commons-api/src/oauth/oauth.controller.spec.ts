import { HttpException } from '@nestjs/common';
import { OAuthController } from './oauth.controller';

describe('OAuthController connection ownership and non-expiring tokens', () => {
  const connection = {
    connectionId: 'connection-1',
    ownerId: 'user-1',
    ownerType: 'user',
    providerId: 'provider-github',
    scopes: ['repo'],
    status: 'active',
    accessTokenExpiresAt: null,
    usageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const providerService = {
    getProviderById: jest.fn().mockResolvedValue({
      providerKey: 'github',
      displayName: 'GitHub',
      logoUrl: '',
    }),
  };
  const connectionService = {
    getConnection: jest.fn().mockResolvedValue(connection),
    listConnections: jest.fn().mockResolvedValue([connection]),
    hasRefreshToken: jest.fn().mockResolvedValue(false),
  };
  const flowService = {
    validateToken: jest.fn().mockResolvedValue(true),
    refreshAccessToken: jest.fn(),
    revokeToken: jest.fn(),
  };
  let controller: OAuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    connectionService.getConnection.mockResolvedValue(connection);
    connectionService.listConnections.mockResolvedValue([connection]);
    connectionService.hasRefreshToken.mockResolvedValue(false);
    flowService.validateToken.mockResolvedValue(true);
    controller = new OAuthController(
      providerService as any,
      connectionService as any,
      flowService as any,
    );
  });

  it('does not expose a connection by ID to another user', async () => {
    const request = {
      principal: { principalId: 'user-2', principalType: 'user' },
      headers: {},
    };

    await expect(
      controller.getConnection('connection-1', request as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('scopes connection listing to the authenticated user instead of query parameters', async () => {
    const request = {
      principal: { principalId: 'user-1', principalType: 'user' },
      headers: {},
    };

    await controller.listConnections('user-2', 'user', request as any);

    expect(connectionService.listConnections).toHaveBeenCalledWith({
      ownerId: 'user-1',
      ownerType: 'user',
    });
  });

  it('validates a non-expiring GitHub token against the provider without marking it expired', async () => {
    const request = {
      principal: { principalId: 'user-1', principalType: 'user' },
      headers: {},
    };

    const result = await controller.testConnection(
      'connection-1',
      request as any,
    );

    expect(result.accessTokenValid).toBe(true);
    expect(result.accessTokenExpiresAt).toBeUndefined();
    expect(flowService.validateToken).toHaveBeenCalledWith('connection-1');
  });

  it('returns a client error instead of poisoning a non-refreshable connection', async () => {
    const request = {
      principal: { principalId: 'user-1', principalType: 'user' },
      headers: {},
    };

    let caught: unknown;
    try {
      await controller.refreshToken('connection-1', request as any);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(400);
    expect(flowService.refreshAccessToken).not.toHaveBeenCalled();
  });
});
