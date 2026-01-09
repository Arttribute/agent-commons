import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServerService } from './mcp-server.service';
import { InferSelectModel } from 'drizzle-orm';
import * as schema from '#/models/schema';

interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  serverId: string;
  connectedAt: Date;
}

@Injectable()
export class McpConnectionService {
  private readonly logger = new Logger(McpConnectionService.name);
  private connections: Map<string, McpConnection> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_MS = 2000;

  constructor(private readonly serverService: McpServerService) {}

  /**
   * Connect to an MCP server
   */
  async connect(
    server: InferSelectModel<typeof schema.mcpServer>,
  ): Promise<Client> {
    try {
      // Check if already connected
      const existing = this.connections.get(server.serverId);
      if (existing) {
        this.logger.log(
          `MCP server ${server.name} is already connected, reusing connection`,
        );
        return existing.client;
      }

      this.logger.log(`Connecting to MCP server: ${server.name}...`);

      // Only stdio is supported for now
      if (server.connectionType !== 'stdio') {
        throw new BadRequestException(
          `Connection type ${server.connectionType} is not yet supported`,
        );
      }

      const config = server.connectionConfig as {
        command: string;
        args?: string[];
        env?: Record<string, string>;
      };

      // Create transport
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env || {},
      });

      // Create client
      const client = new Client(
        {
          name: 'commons-api',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      // Set up error handlers
      client.onerror = (error) => {
        this.logger.error(
          `MCP client error for ${server.name}: ${error.message}`,
          error.stack,
        );
        this.handleDisconnect(server.serverId, error.message);
      };

      transport.onerror = (error) => {
        this.logger.error(
          `MCP transport error for ${server.name}: ${error}`,
        );
        this.handleDisconnect(server.serverId, String(error));
      };

      transport.onclose = () => {
        this.logger.warn(`MCP transport closed for ${server.name}`);
        this.handleDisconnect(server.serverId, 'Transport closed');
      };

      // Connect
      await client.connect(transport);

      // Store connection
      this.connections.set(server.serverId, {
        client,
        transport,
        serverId: server.serverId,
        connectedAt: new Date(),
      });

      // Reset reconnect attempts
      this.reconnectAttempts.delete(server.serverId);

      // Update server status
      await this.serverService.updateStatus(server.serverId, 'connected');

      this.logger.log(
        `Successfully connected to MCP server: ${server.name}`,
      );

      return client;
    } catch (error: any) {
      this.logger.error(
        `Failed to connect to MCP server ${server.name}: ${error.message}`,
        error.stack,
      );

      // Update server status
      await this.serverService.updateStatus(
        server.serverId,
        'error',
        error.message,
      );

      throw new BadRequestException(
        `Failed to connect to MCP server: ${error.message}`,
      );
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      this.logger.warn(`No active connection for server ${serverId}`);
      return;
    }

    try {
      this.logger.log(`Disconnecting from MCP server: ${serverId}`);

      // Close client
      await connection.client.close();

      // Remove from connections
      this.connections.delete(serverId);

      // Update server status
      await this.serverService.updateStatus(serverId, 'disconnected');

      this.logger.log(`Disconnected from MCP server: ${serverId}`);
    } catch (error: any) {
      this.logger.error(
        `Error disconnecting from server ${serverId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get active connection for a server (lazy connect)
   */
  async getConnection(
    server: InferSelectModel<typeof schema.mcpServer>,
  ): Promise<Client> {
    const existing = this.connections.get(server.serverId);
    if (existing) {
      return existing.client;
    }

    // Lazy connection: connect on first use
    return await this.connect(server);
  }

  /**
   * Check if server is connected
   */
  isConnected(serverId: string): boolean {
    return this.connections.has(serverId);
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    this.logger.log('Disconnecting all MCP servers...');

    const serverIds = Array.from(this.connections.keys());
    await Promise.all(serverIds.map((id) => this.disconnect(id)));

    this.logger.log('All MCP servers disconnected');
  }

  /* ─────────────────────────  PRIVATE METHODS  ───────────────────────── */

  /**
   * Handle unexpected disconnection
   */
  private async handleDisconnect(
    serverId: string,
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `MCP server ${serverId} disconnected: ${reason}`,
    );

    // Remove connection
    this.connections.delete(serverId);

    // Update status
    await this.serverService.updateStatus(serverId, 'error', reason);

    // Attempt reconnection with exponential backoff
    const attempts = this.reconnectAttempts.get(serverId) || 0;
    if (attempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts.set(serverId, attempts + 1);

      const delay = this.RECONNECT_DELAY_MS * Math.pow(2, attempts);
      this.logger.log(
        `Attempting reconnection ${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`,
      );

      setTimeout(async () => {
        try {
          const server = await this.serverService.getServer(serverId);
          await this.connect(server as any);
        } catch (error: any) {
          this.logger.error(
            `Reconnection attempt failed: ${error.message}`,
          );
        }
      }, delay);
    } else {
      this.logger.error(
        `Max reconnection attempts reached for server ${serverId}`,
      );
      this.reconnectAttempts.delete(serverId);
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    await this.disconnectAll();
  }
}
