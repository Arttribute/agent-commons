import { Reflector } from '@nestjs/core';
import { McpOwnerGuard } from './mcp-owner.guard';
import { McpServerController } from './mcp-server.controller';

describe('MCP connection account ownership', () => {
  const serverId = '11111111-1111-4111-8111-111111111111';
  const agentId = '22222222-2222-4222-8222-222222222222';
  const toolId = '33333333-3333-4333-8333-333333333333';
  const db = { query: { mcpServer: { findFirst: jest.fn() }, mcpTool: { findFirst: jest.fn() }, agent: { findFirst: jest.fn() } } };
  const guard = new McpOwnerGuard(new Reflector(), db as any);
  const context = (req: any, handler = () => {}) => ({ getHandler: () => handler, switchToHttp: () => ({ getRequest: () => req }) }) as any;
  const user = (id = 'account-a') => ({ method: 'GET', headers: { 'x-owner-id': 'account-a' }, principal: { principalId: id, principalType: 'user' }, params: {}, query: {} }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mcpServer.findFirst.mockResolvedValue({ serverId, ownerId: 'account-a', ownerType: 'user', isPublic: true });
    db.query.mcpTool.findFirst.mockResolvedValue({ mcpToolId: toolId, serverId });
    db.query.agent.findFirst.mockResolvedValue({ ownerUserId: 'account-a', owner: 'legacy-account', workspaceId: 'workspace-a' });
  });

  it('defaults collections to the authenticated account and rejects forged owner/header combinations', async () => {
    const request = user();
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.mcpOwner).toEqual({ ownerId: 'account-a', ownerType: 'user' });
    const foreign = user('account-b'); foreign.query.ownerId = 'account-a';
    await expect(guard.canActivate(context(foreign))).rejects.toThrow('do not own');
    const repeated = user(); repeated.query.ownerType = ['user'];
    await expect(guard.canActivate(context(repeated))).rejects.toThrow('Invalid MCP owner');
  });

  it('protects configuration, tool metadata and mutations even when the server is public', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const request = user('account-b'); request.method = method; request.params.serverId = serverId;
      await expect(guard.canActivate(context(request))).rejects.toThrow('do not own');
    }
    const tool = user('account-b'); tool.params.mcpToolId = toolId;
    await expect(guard.canActivate(context(tool))).rejects.toThrow('do not own');
    const own = user(); own.params.serverId = serverId;
    await expect(guard.canActivate(context(own))).resolves.toBe(true);
  });

  it('allows owned agent connections and signed workspace access, rejecting another account', async () => {
    db.query.mcpServer.findFirst.mockResolvedValue({ serverId, ownerId: agentId, ownerType: 'agent' });
    const own = user(); own.params.serverId = serverId;
    await expect(guard.canActivate(context(own))).resolves.toBe(true);
    const foreign = user('account-b'); foreign.params.serverId = serverId;
    await expect(guard.canActivate(context(foreign))).rejects.toThrow('do not own');
    foreign.principal.workspaceId = 'workspace-a';
    await expect(guard.canActivate(context(foreign))).resolves.toBe(true);
    foreign.principal.workspaceId = 'workspace-b';
    await expect(guard.canActivate(context(foreign))).rejects.toThrow('do not own');
    const agent = user(agentId); agent.principal.principalType = 'agent'; agent.query = { ownerId: agentId, ownerType: 'agent' };
    await expect(guard.canActivate(context(agent))).resolves.toBe(true);
  });

  it('supports service delegation without accepting an unrelated owner query', async () => {
    const req = user('commons-app-service'); req.principal.principalType = 'service';
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.mcpOwner.ownerId).toBe('account-a');
    req.query.ownerId = 'account-b';
    await expect(guard.canActivate(context(req))).rejects.toThrow('do not own');
  });

  it('returns bounded errors for absent or invalid resources', async () => {
    const req = user(); req.params.serverId = 'invalid';
    await expect(guard.canActivate(context(req))).rejects.toThrow('Invalid MCP resource');
    req.params.serverId = serverId; db.query.mcpServer.findFirst.mockResolvedValue(undefined);
    await expect(guard.canActivate(context(req))).rejects.toThrow('not found');
  });

  it('lists public catalog metadata without exposing executable arguments or credentials', async () => {
    const service = { listPublicServers: jest.fn().mockResolvedValue([{ serverId, connectionConfig: { env: { TOKEN: 'private' }, args: ['private'], url: 'https://endpoint.invalid/?token=private' } }]) };
    const controller = new McpServerController(service as any, {} as any, {} as any);
    await expect(guard.canActivate(context(user('account-b'), controller.getMarketplace))).resolves.toBe(true);
    expect((await controller.getMarketplace()).servers[0].connectionConfig).toEqual({});
  });
});
