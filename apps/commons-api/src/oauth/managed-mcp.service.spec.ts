import { ManagedMcpService } from './managed-mcp.service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: jest.fn() }));

describe('HubSpot MCP transports and tool permissions', () => {
  const clients: any[] = [];
  const catalog = [{ name: 'search', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }, { name: 'write', inputSchema: { type: 'object' } }];
  const connections = { getConnectionByOwner: jest.fn(async (owner: string) => ({ status: 'active', connectionId: `${owner}-connection` })) };
  const flow = { getFreshAccessToken: jest.fn(async (id: string) => `${id}-token`) };
  beforeEach(() => {
    jest.clearAllMocks(); clients.length = 0;
    (Client as jest.Mock).mockImplementation(() => {
      const client = { connect: jest.fn(), close: jest.fn().mockResolvedValue(undefined), listTools: jest.fn().mockResolvedValue({ tools: catalog }), callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'actual result' }] }) };
      clients.push(client); return client;
    });
  });
  const service = () => new ManagedMcpService(connections as any, flow as any);
  it('creates fresh transports with each account’s token and closes every client', async () => {
    await service().list('alice'); await service().list('bob');
    expect(StreamableHTTPClientTransport).toHaveBeenNthCalledWith(1, new URL('https://mcp.hubspot.com/'), { requestInit: { headers: { Authorization: 'Bearer alice-connection-token' } } });
    expect(StreamableHTTPClientTransport).toHaveBeenNthCalledWith(2, new URL('https://mcp.hubspot.com/'), { requestInit: { headers: { Authorization: 'Bearer bob-connection-token' } } });
    expect(clients.every((client) => client.close.mock.calls.length === 1)).toBe(true);
  });
  it('treats unannotated tools as writes and requires approval before calling them', async () => {
    await expect(service().invoke('alice', 'hubspot_mcp', 'write', { note: 'x' })).rejects.toThrow(/approve/);
    expect(clients[0].callTool).not.toHaveBeenCalled();
    await service().invoke('alice', 'hubspot_mcp', 'write', { note: 'x' }, true);
    expect(clients[1].callTool).toHaveBeenCalledWith({ name: 'write', arguments: { note: 'x' } }, undefined, { timeout: 30_000 });
  });
  it('blocks account changes before opening a transport', async () => {
    await expect(service().invoke('bob', 'hubspot_mcp', 'search', {}, false, 'alice-connection')).rejects.toThrow(/account changed/);
    expect(Client).not.toHaveBeenCalled();
  });
});
