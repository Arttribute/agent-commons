import { Injectable, Logger, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServerService } from './mcp-server.service';
import { InferSelectModel } from 'drizzle-orm';
import * as schema from '#/models/schema';

type AnyTransport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

interface McpConnection {
  client: Client;
  transport: AnyTransport;
  serverId: string;
  connectionType: string;
  connectedAt: Date;
  lastUsedAt: Date;
}

/**
 * Manages a pool of MCP client connections.
 *
 * Supported transports:
 *   stdio          — subprocess via stdin/stdout (local tools)
 *   sse            — legacy SSE transport (MCP pre-2025-03-26 spec)
 *   http / streamable-http — StreamableHTTP (MCP 2025-03-26 spec, production default)
 */
@Injectable()
export class McpConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(McpConnectionService.name);
  private readonly pool: Map<string, McpConnection> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private readonly MAX_RECONNECT = 3;
  private readonly RECONNECT_BASE_MS = 2000;
  /** Idle connections are cleaned up after this period (ms). */
  private readonly IDLE_TIMEOUT_MS = 10 * 60_000; // 10 minutes

  constructor(private readonly serverService: McpServerService) {
    // Periodically evict idle connections
    setInterval(() => this.evictIdle(), 5 * 60_000).unref();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Connect to an MCP server and return a ready Client.
   * Idempotent — returns an existing connection if one is alive.
   */
  async connect(server: InferSelectModel<typeof schema.mcpServer>): Promise<Client> {
    const existing = this.pool.get(server.serverId);
    if (existing) {
      existing.lastUsedAt = new Date();
      this.logger.debug(`Reusing connection to MCP server: ${server.name}`);
      return existing.client;
    }

    this.logger.log(`Connecting to MCP server: ${server.name} (${server.connectionType})`);

    try {
      const { client, transport } = await this.buildConnection(server);
      this.pool.set(server.serverId, {
        client,
        transport,
        serverId: server.serverId,
        connectionType: server.connectionType,
        connectedAt: new Date(),
        lastUsedAt: new Date(),
      });
      this.reconnectAttempts.delete(server.serverId);
      await this.serverService.updateStatus(server.serverId, 'connected');
      this.logger.log(`Connected to MCP server: ${server.name}`);
      return client;
    } catch (error: any) {
      this.logger.error(`Failed to connect to ${server.name}: ${error.message}`);
      await this.serverService.updateStatus(server.serverId, 'error', error.message);
      throw new BadRequestException(`Failed to connect to MCP server: ${error.message}`);
    }
  }

  /** Get client for a server, connecting lazily on first call. */
  async getConnection(server: InferSelectModel<typeof schema.mcpServer>): Promise<Client> {
    const existing = this.pool.get(server.serverId);
    if (existing) {
      existing.lastUsedAt = new Date();
      return existing.client;
    }
    return this.connect(server);
  }

  async disconnect(serverId: string): Promise<void> {
    const conn = this.pool.get(serverId);
    if (!conn) return;
    try {
      await conn.client.close();
    } catch (e: any) {
      this.logger.warn(`Error closing MCP client ${serverId}: ${e.message}`);
    }
    this.pool.delete(serverId);
    await this.serverService.updateStatus(serverId, 'disconnected');
    this.logger.log(`Disconnected from MCP server: ${serverId}`);
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.pool.keys()].map((id) => this.disconnect(id)));
  }

  isConnected(serverId: string): boolean {
    return this.pool.has(serverId);
  }

  getActiveConnections(): string[] {
    return [...this.pool.keys()];
  }

  async onModuleDestroy() {
    await this.disconnectAll();
  }

  // ── Private: transport factory ─────────────────────────────────────────────

  private async buildConnection(
    server: InferSelectModel<typeof schema.mcpServer>,
  ): Promise<{ client: Client; transport: AnyTransport }> {
    const config = server.connectionConfig as Record<string, any>;
    const type = server.connectionType as string;

    let transport: AnyTransport;

    if (type === 'stdio') {
      if (!config.command) throw new Error('stdio connection requires a "command" field');
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: config.env ?? {},
      });
    } else if (type === 'sse') {
      // Legacy SSE transport — MCP spec prior to 2025-03-26
      if (!config.url) throw new Error('sse connection requires a "url" field');
      const headers: Record<string, string> = config.headers ?? {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      transport = new SSEClientTransport(new URL(config.url), { requestInit: { headers } });
    } else if (type === 'http' || type === 'streamable-http') {
      // StreamableHTTP — MCP spec 2025-03-26 (production default)
      if (!config.url) throw new Error('http connection requires a "url" field');
      const headers: Record<string, string> = config.headers ?? {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers },
      });
    } else {
      throw new BadRequestException(
        `Unsupported MCP connection type "${type}". Use: stdio | sse | http`,
      );
    }

    const client = new Client(
      { name: 'commons-api', version: '1.0.0' },
      { capabilities: { roots: { listChanged: true } } },
    );

    client.onerror = (error) => {
      this.logger.error(`MCP client error [${server.name}]: ${error.message}`);
      this.handleDisconnect(server.serverId, error.message).catch(() => undefined);
    };

    if (transport instanceof StdioClientTransport) {
      transport.onerror = (error) => {
        this.logger.error(`MCP transport error [${server.name}]: ${error}`);
        this.handleDisconnect(server.serverId, String(error)).catch(() => undefined);
      };
      transport.onclose = () => {
        this.logger.warn(`MCP transport closed [${server.name}]`);
        this.handleDisconnect(server.serverId, 'Transport closed').catch(() => undefined);
      };
    }

    await client.connect(transport);
    return { client, transport };
  }

  // ── Private: reconnect + idle eviction ────────────────────────────────────

  private async handleDisconnect(serverId: string, reason: string): Promise<void> {
    this.logger.warn(`MCP server ${serverId} disconnected: ${reason}`);
    this.pool.delete(serverId);
    await this.serverService.updateStatus(serverId, 'error', reason).catch(() => undefined);

    const attempts = this.reconnectAttempts.get(serverId) ?? 0;
    if (attempts >= this.MAX_RECONNECT) {
      this.logger.error(`Max reconnect attempts reached for ${serverId}`);
      this.reconnectAttempts.delete(serverId);
      return;
    }

    this.reconnectAttempts.set(serverId, attempts + 1);
    const delay = this.RECONNECT_BASE_MS * Math.pow(2, attempts);
    this.logger.log(`Reconnecting ${serverId} in ${delay}ms (attempt ${attempts + 1}/${this.MAX_RECONNECT})`);

    setTimeout(async () => {
      try {
        const serverDto = await this.serverService.getServer(serverId);
        const serverRecord = serverDto as any; // McpServerResponseDto has all fields we need
        await this.connect(serverRecord);
      } catch (e: any) {
        this.logger.error(`Reconnect failed for ${serverId}: ${e.message}`);
      }
    }, delay).unref();
  }

  private evictIdle(): void {
    const cutoff = Date.now() - this.IDLE_TIMEOUT_MS;
    for (const [id, conn] of this.pool.entries()) {
      if (conn.lastUsedAt.getTime() < cutoff) {
        this.logger.log(`Evicting idle MCP connection: ${id}`);
        this.disconnect(id).catch(() => undefined);
      }
    }
  }
}
