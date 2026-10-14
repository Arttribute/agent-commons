import { ConnectedAppsController } from './connected-apps.controller';
jest.mock('./tool.service', () => ({ ToolService: class {} }));
jest.mock('~/oauth/managed-mcp.service', () => ({ ManagedMcpService: class {} }));

describe('connected apps preserve account and permission boundaries', () => {
  const setup = () => {
    const tool = { name: 'hubspot_search_contacts', ownerType: 'platform', visibility: 'platform', tags: ['read'], apiSpec: { method: 'POST', authType: 'oauth2', oauthProviderKey: 'hubspot', oauthScopes: ['crm.objects.contacts.read'] } };
    const tools = { getToolByName: jest.fn().mockResolvedValue(tool), getAllTools: jest.fn().mockResolvedValue([tool]) };
    const providers = { listProviders: jest.fn().mockResolvedValue([{ providerKey: 'hubspot', displayName: 'HubSpot', scopes: { default: ['oauth'] } }]) };
    const connections = { getConnectionByOwner: jest.fn().mockResolvedValue({ status: 'active', connectionId: 'alice-connection', scopes: ['crm.objects.contacts.read'] }) };
    const invocation = { invokeDynamicTool: jest.fn().mockResolvedValue({ results: [] }) };
    const mcp = { invoke: jest.fn().mockResolvedValue({ content: [] }), list: jest.fn().mockResolvedValue([]) };
    return { controller: new ConnectedAppsController(tools as any, providers as any, connections as any, invocation as any, mcp as any), tools, connections, invocation, mcp };
  };
  const request = { principal: { principalId: 'alice', principalType: 'user' }, headers: { 'x-initiator': 'bob' } } as any;
  it('uses the authenticated account and strips internal connection IDs from provider inputs', async () => {
    const { controller, connections, invocation } = setup();
    await controller.invoke(request, 'hubspot_search_contacts', { query: 'Amina', _commonsConnectionId: 'alice-connection' });
    expect(connections.getConnectionByOwner).toHaveBeenCalledWith('alice', 'hubspot', 'user');
    expect(invocation.invokeDynamicTool).toHaveBeenCalledWith(expect.anything(), { query: 'Amina' }, { sessionInitiator: 'alice' });
  });
  it('blocks missing scopes and changed accounts before making a provider request', async () => {
    const { controller, connections, invocation } = setup();
    await expect(controller.invoke(request, 'hubspot_search_contacts', { _commonsConnectionId: 'old-connection' })).rejects.toThrow(/account changed/);
    connections.getConnectionByOwner.mockResolvedValue({ status: 'active', scopes: [] } as any);
    await expect(controller.invoke(request, 'hubspot_search_contacts', {})).rejects.toThrow(/required permissions/);
    expect(invocation.invokeDynamicTool).not.toHaveBeenCalled();
  });
  it('rejects user-created tool definitions that could redirect server-held credentials', async () => {
    const { controller, tools, invocation } = setup();
    tools.getToolByName.mockResolvedValue({ ownerType: 'user', apiSpec: { authType: 'oauth2', oauthProviderKey: 'hubspot' } } as any);
    await expect(controller.invoke(request, 'custom', {})).rejects.toThrow(/not found/);
    expect(invocation.invokeDynamicTool).not.toHaveBeenCalled();
  });
  it('routes HubSpot MCP calls separately and keeps confirmation out of the remote tool input', async () => {
    const { controller, mcp } = setup();
    await controller.invoke(request, 'hubspot_mcp__create_note', { note: 'approved', _commonsConfirmed: true, _commonsConnectionId: 'alice-connection' });
    expect(mcp.invoke).toHaveBeenCalledWith('alice', 'hubspot_mcp', 'create_note', { note: 'approved' }, true, 'alice-connection');
  });
});
