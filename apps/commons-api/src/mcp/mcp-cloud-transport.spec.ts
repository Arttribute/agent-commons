import { McpConnectionService } from './mcp-connection.service';
import { McpServerService } from './mcp-server.service';
import { requireCloudMcpTransport } from './mcp-cloud-transport';

describe('Cloud MCP execution location', () => {
  const status = { updateStatus: jest.fn() };
  beforeEach(() => jest.clearAllMocks());

  it('accepts modern HTTP and legacy remote SSE, rejecting command transports', () => {
    for (const type of ['http', 'streamable-http', 'sse'])
      expect(() => requireCloudMcpTransport(type)).not.toThrow();
    for (const type of ['stdio', 'unknown'])
      expect(() => requireCloudMcpTransport(type)).toThrow(
        'remote HTTP or SSE endpoint',
      );
  });

  it('blocks command registration before storing any configuration', async () => {
    const db = { insert: jest.fn() };
    const service = new McpServerService(db as any);
    await expect(
      service.createServer({
        ownerId: 'fixture-owner',
        ownerType: 'user',
        dto: {
          name: 'fixture',
          connectionType: 'stdio',
          connectionConfig: {
            command: process.execPath,
            args: ['-e', 'process.exit(0)'],
          },
        },
      }),
    ).rejects.toThrow('remote HTTP or SSE endpoint');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('refuses both new and cached command connections without starting a child or reusing its client', async () => {
    const service = new McpConnectionService(status as any);
    const client = { connect: jest.fn(), callTool: jest.fn() };
    const server = {
      serverId: 'fixture',
      connectionType: 'stdio',
      connectionConfig: {
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
      },
    };
    await expect(service.connect(server as any)).rejects.toThrow(
      'remote HTTP or SSE endpoint',
    );
    (service as any).pool.set(server.serverId, { client });
    await expect(service.getConnection(server as any)).rejects.toThrow(
      'remote HTTP or SSE endpoint',
    );
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.callTool).not.toHaveBeenCalled();
    expect(status.updateStatus).not.toHaveBeenCalled();
    (service as any).pool.clear();
  });
});
