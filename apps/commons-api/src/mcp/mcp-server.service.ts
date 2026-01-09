import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { eq, and } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { InferSelectModel } from 'drizzle-orm';
import {
  CreateMcpServerDto,
  UpdateMcpServerDto,
  McpServerResponseDto,
} from './dto/mcp.dto';

@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Create a new MCP server
   */
  async createServer(params: {
    ownerId: string;
    ownerType: 'user' | 'agent';
    dto: CreateMcpServerDto;
  }): Promise<McpServerResponseDto> {
    try {
      // Validate connection config based on type
      this.validateConnectionConfig(
        params.dto.connectionType,
        params.dto.connectionConfig,
      );

      const [server] = await this.db
        .insert(schema.mcpServer)
        .values({
          name: params.dto.name,
          description: params.dto.description || null,
          ownerId: params.ownerId,
          ownerType: params.ownerType,
          connectionType: params.dto.connectionType,
          connectionConfig: params.dto.connectionConfig,
          isPublic: params.dto.isPublic || false,
          tags: params.dto.tags || null,
          status: 'disconnected',
        })
        .returning();

      this.logger.log(
        `Created MCP server: ${server.name} (${server.serverId})`,
      );

      return this.toResponseDto(server, 0);
    } catch (error: any) {
      this.logger.error(
        `Failed to create MCP server: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to create MCP server: ${error.message}`,
      );
    }
  }

  /**
   * Get MCP server by ID
   */
  async getServer(serverId: string): Promise<McpServerResponseDto> {
    const server = await this.db.query.mcpServer.findFirst({
      where: (s) => eq(s.serverId, serverId),
      with: {
        tools: true,
      },
    });

    if (!server) {
      throw new NotFoundException(`MCP server ${serverId} not found`);
    }

    const toolsCount = server.tools?.length || 0;
    return this.toResponseDto(server, toolsCount);
  }

  /**
   * List MCP servers by owner
   */
  async listServers(params: {
    ownerId: string;
    ownerType: 'user' | 'agent';
  }): Promise<McpServerResponseDto[]> {
    const servers = await this.db.query.mcpServer.findMany({
      where: (s) =>
        and(eq(s.ownerId, params.ownerId), eq(s.ownerType, params.ownerType)),
      with: {
        tools: true,
      },
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    return servers.map((server) => {
      const toolsCount = server.tools?.length || 0;
      return this.toResponseDto(server, toolsCount);
    });
  }

  /**
   * List all public MCP servers (marketplace)
   */
  async listPublicServers(): Promise<McpServerResponseDto[]> {
    const servers = await this.db.query.mcpServer.findMany({
      where: (s) => eq(s.isPublic, true),
      with: {
        tools: true,
      },
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    return servers.map((server) => {
      const toolsCount = server.tools?.length || 0;
      return this.toResponseDto(server, toolsCount);
    });
  }

  /**
   * Update MCP server
   */
  async updateServer(
    serverId: string,
    dto: UpdateMcpServerDto,
  ): Promise<McpServerResponseDto> {
    try {
      // Validate connection config if provided
      if (dto.connectionConfig) {
        const server = await this.db.query.mcpServer.findFirst({
          where: (s) => eq(s.serverId, serverId),
        });

        if (!server) {
          throw new NotFoundException(`MCP server ${serverId} not found`);
        }

        this.validateConnectionConfig(
          server.connectionType as 'stdio' | 'sse',
          dto.connectionConfig,
        );
      }

      const updateData: any = {};
      if (dto.name) updateData.name = dto.name;
      if (dto.description !== undefined)
        updateData.description = dto.description;
      if (dto.connectionConfig)
        updateData.connectionConfig = dto.connectionConfig;
      if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;
      if (dto.tags !== undefined) updateData.tags = dto.tags;

      const [updated] = await this.db
        .update(schema.mcpServer)
        .set(updateData)
        .where(eq(schema.mcpServer.serverId, serverId))
        .returning();

      if (!updated) {
        throw new NotFoundException(`MCP server ${serverId} not found`);
      }

      this.logger.log(`Updated MCP server: ${updated.name} (${serverId})`);

      const toolsCount = await this.getToolsCount(serverId);
      return this.toResponseDto(updated, toolsCount);
    } catch (error: any) {
      this.logger.error(
        `Failed to update MCP server ${serverId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete MCP server (and all its tools via cascade)
   */
  async deleteServer(serverId: string): Promise<void> {
    try {
      const result = await this.db
        .delete(schema.mcpServer)
        .where(eq(schema.mcpServer.serverId, serverId))
        .returning();

      if (result.length === 0) {
        throw new NotFoundException(`MCP server ${serverId} not found`);
      }

      this.logger.log(`Deleted MCP server: ${serverId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to delete MCP server ${serverId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update server status
   */
  async updateStatus(
    serverId: string,
    status: 'connected' | 'disconnected' | 'error',
    error?: string,
  ): Promise<void> {
    try {
      await this.db
        .update(schema.mcpServer)
        .set({
          status,
          lastError: error || null,
          lastConnectedAt:
            status === 'connected' ? new Date() : undefined,
        })
        .where(eq(schema.mcpServer.serverId, serverId));

      this.logger.log(`Updated server ${serverId} status to: ${status}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to update server status: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Update capabilities after discovery
   */
  async updateCapabilities(
    serverId: string,
    capabilities: {
      tools?: boolean;
      resources?: boolean;
      prompts?: boolean;
    },
  ): Promise<void> {
    try {
      await this.db
        .update(schema.mcpServer)
        .set({ capabilities })
        .where(eq(schema.mcpServer.serverId, serverId));

      this.logger.log(`Updated server ${serverId} capabilities`);
    } catch (error: any) {
      this.logger.error(
        `Failed to update capabilities: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Update last synced timestamp
   */
  async updateLastSynced(serverId: string): Promise<void> {
    try {
      await this.db
        .update(schema.mcpServer)
        .set({ lastSyncedAt: new Date() })
        .where(eq(schema.mcpServer.serverId, serverId));
    } catch (error: any) {
      this.logger.error(
        `Failed to update last synced: ${error.message}`,
        error.stack,
      );
    }
  }

  /* ─────────────────────────  PRIVATE HELPERS  ───────────────────────── */

  /**
   * Validate connection configuration based on type
   */
  private validateConnectionConfig(
    connectionType: 'stdio' | 'sse',
    config: any,
  ): void {
    if (connectionType === 'stdio') {
      if (!config.command) {
        throw new BadRequestException(
          'stdio connection requires a command field',
        );
      }
    } else if (connectionType === 'sse') {
      if (!config.url) {
        throw new BadRequestException('sse connection requires a url field');
      }
    }
  }

  /**
   * Get count of tools for a server
   */
  private async getToolsCount(serverId: string): Promise<number> {
    const tools = await this.db.query.mcpTool.findMany({
      where: (t) => eq(t.serverId, serverId),
    });
    return tools.length;
  }

  /**
   * Convert database model to response DTO
   */
  private toResponseDto(
    server: InferSelectModel<typeof schema.mcpServer>,
    toolsCount: number,
  ): McpServerResponseDto {
    return {
      serverId: server.serverId,
      name: server.name,
      description: server.description,
      connectionType: server.connectionType as 'stdio' | 'sse',
      connectionConfig: server.connectionConfig as any,
      status: (server.status as 'connected' | 'disconnected' | 'error') || 'disconnected',
      lastError: server.lastError,
      lastConnectedAt: server.lastConnectedAt,
      capabilities: server.capabilities as any,
      toolsCount,
      lastSyncedAt: server.lastSyncedAt,
      isPublic: server.isPublic || false,
      tags: server.tags as string[] | null,
      ownerId: server.ownerId,
      ownerType: server.ownerType as 'user' | 'agent',
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    };
  }
}
