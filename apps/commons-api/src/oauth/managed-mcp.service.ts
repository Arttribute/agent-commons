import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OAuthConnectionService } from './oauth-connection.service';
import { OAuthFlowService } from './oauth-flow.service';

const ENDPOINTS: Record<string, string> = { hubspot_mcp: 'https://mcp.hubspot.com/' };

/** Fresh, account-scoped transports prevent another user's MCP session being reused. */
@Injectable()
export class ManagedMcpService {
  constructor(private readonly connections: OAuthConnectionService, private readonly flow: OAuthFlowService) {}
  private async withClient<T>(ownerId: string, provider: string, execute: (client: Client) => Promise<T>, expectedConnectionId?: string) {
    const endpoint = ENDPOINTS[provider];
    if (!endpoint) throw new BadRequestException('Unsupported managed MCP provider.');
    const connection = await this.connections.getConnectionByOwner(ownerId, provider, 'user');
    if (connection?.status !== 'active') throw new UnauthorizedException('Connect HubSpot MCP in Tools first.');
    if (expectedConnectionId && connection.connectionId !== expectedConnectionId) throw new UnauthorizedException('The connected account changed. Select the app again before continuing.');
    const token = await this.flow.getFreshAccessToken(connection.connectionId);
    const client = new Client({ name: 'agent-commons', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }), { timeout: 15_000 });
      return await execute(client);
    } finally { await client.close().catch(() => undefined); }
  }
  private async catalog(client: Client) {
    const tools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: 15_000 });
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) throw new BadRequestException('MCP server repeated a catalog page.');
      if (cursor) cursors.add(cursor);
    } while (cursor && tools.length < 1000);
    return tools;
  }
  list(ownerId: string, provider = 'hubspot_mcp') {
    return this.withClient(ownerId, provider, (client) => this.catalog(client));
  }
  invoke(ownerId: string, provider: string, name: string, args: Record<string, unknown>, confirmed?: boolean, expectedConnectionId?: string) {
    return this.withClient(ownerId, provider, async (client) => {
      const tool = (await this.catalog(client)).find((tool) => tool.name === name);
      if (!tool) throw new BadRequestException('This HubSpot MCP tool is unavailable for the connected account.');
      const readOnly = tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true;
      if (!readOnly && confirmed !== true) throw new BadRequestException('Review the exact HubSpot MCP action and ask the user to approve it before setting confirmed=true.');
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 });
      if (result.isError) throw new BadRequestException({ message: 'HubSpot MCP tool failed.', details: result.content });
      return result;
    }, expectedConnectionId);
  }
}
