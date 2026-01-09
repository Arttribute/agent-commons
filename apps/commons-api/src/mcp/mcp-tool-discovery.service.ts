import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { McpServerService } from './mcp-server.service';
import { McpConnectionService } from './mcp-connection.service';
import { eq, and, sql as drizzleSql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { InferSelectModel } from 'drizzle-orm';
import { McpToolResponseDto, McpSyncResponseDto } from './dto/mcp.dto';
import { ChatCompletionTool } from 'openai/resources/chat/completions.mjs';

@Injectable()
export class McpToolDiscoveryService {
  private readonly logger = new Logger(McpToolDiscoveryService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly serverService: McpServerService,
    private readonly connectionService: McpConnectionService,
  ) {}

  /**
   * Discover and sync tools from an MCP server
   */
  async syncTools(serverId: string): Promise<McpSyncResponseDto> {
    try {
      this.logger.log(`Syncing tools from MCP server: ${serverId}`);

      // Get server config
      const serverDto = await this.serverService.getServer(serverId);
      const server = await this.db.query.mcpServer.findFirst({
        where: (s) => eq(s.serverId, serverId),
      });

      if (!server) {
        throw new BadRequestException(`Server ${serverId} not found`);
      }

      // Get or create connection
      const client = await this.connectionService.getConnection(server);

      // List available tools from MCP server
      const toolsList = await client.listTools();

      this.logger.log(
        `Discovered ${toolsList.tools.length} tools from ${server.name}`,
      );

      // Update server capabilities
      await this.serverService.updateCapabilities(serverId, {
        tools: toolsList.tools.length > 0,
      });

      // Get existing tools in database
      const existingTools = await this.db.query.mcpTool.findMany({
        where: (t) => eq(t.serverId, serverId),
      });

      const existingToolNames = new Set(
        existingTools.map((t) => t.toolName),
      );
      const discoveredToolNames = new Set(
        toolsList.tools.map((t) => t.name),
      );

      let toolsAdded = 0;
      let toolsUpdated = 0;
      let toolsRemoved = 0;

      // Add or update tools
      for (const mcpTool of toolsList.tools) {
        const existing = existingTools.find(
          (t) => t.toolName === mcpTool.name,
        );

        if (existing) {
          // Update existing tool
          await this.db
            .update(schema.mcpTool)
            .set({
              displayName: mcpTool.name,
              description: mcpTool.description || null,
              inputSchema: mcpTool.inputSchema,
              updatedAt: new Date(),
            })
            .where(eq(schema.mcpTool.mcpToolId, existing.mcpToolId));

          toolsUpdated++;
        } else {
          // Add new tool
          await this.db.insert(schema.mcpTool).values({
            serverId,
            toolName: mcpTool.name,
            displayName: mcpTool.name,
            description: mcpTool.description || null,
            inputSchema: mcpTool.inputSchema,
            isActive: true,
            usageCount: 0,
          });

          toolsAdded++;
        }
      }

      // Remove tools that no longer exist on the server
      for (const existing of existingTools) {
        if (!discoveredToolNames.has(existing.toolName)) {
          await this.db
            .delete(schema.mcpTool)
            .where(eq(schema.mcpTool.mcpToolId, existing.mcpToolId));

          toolsRemoved++;
        }
      }

      // Update last synced timestamp
      await this.serverService.updateLastSynced(serverId);

      this.logger.log(
        `Sync completed: +${toolsAdded} ~${toolsUpdated} -${toolsRemoved}`,
      );

      return {
        success: true,
        toolsDiscovered: toolsList.tools.length,
        toolsAdded,
        toolsUpdated,
        toolsRemoved,
        syncedAt: new Date(),
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to sync tools from server ${serverId}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        toolsDiscovered: 0,
        toolsAdded: 0,
        toolsUpdated: 0,
        toolsRemoved: 0,
        syncedAt: new Date(),
        error: error.message,
      };
    }
  }

  /**
   * Get all tools for a server
   */
  async getToolsByServer(serverId: string): Promise<McpToolResponseDto[]> {
    const server = await this.db.query.mcpServer.findFirst({
      where: (s) => eq(s.serverId, serverId),
    });

    if (!server) {
      throw new BadRequestException(`Server ${serverId} not found`);
    }

    const tools = await this.db.query.mcpTool.findMany({
      where: (t) => and(eq(t.serverId, serverId), eq(t.isActive, true)),
      orderBy: (t, { desc }) => [desc(t.usageCount)],
    });

    return tools.map((tool) => this.toResponseDto(tool, server.name));
  }

  /**
   * Get all tools for an owner (across all their servers)
   */
  async getToolsByOwner(params: {
    ownerId: string;
    ownerType: 'user' | 'agent';
  }): Promise<McpToolResponseDto[]> {
    const servers = await this.db.query.mcpServer.findMany({
      where: (s) =>
        and(eq(s.ownerId, params.ownerId), eq(s.ownerType, params.ownerType)),
      with: {
        tools: {
          where: (t) => eq(t.isActive, true),
          orderBy: (t, { desc }) => [desc(t.usageCount)],
        },
      },
    });

    const allTools: McpToolResponseDto[] = [];
    for (const server of servers) {
      if (server.tools) {
        for (const tool of server.tools) {
          allTools.push(this.toResponseDto(tool, server.name));
        }
      }
    }

    return allTools;
  }

  /**
   * Get a specific MCP tool by ID
   */
  async getTool(mcpToolId: string): Promise<McpToolResponseDto> {
    const tool = await this.db.query.mcpTool.findFirst({
      where: (t) => eq(t.mcpToolId, mcpToolId),
    });

    if (!tool) {
      throw new BadRequestException(`MCP tool ${mcpToolId} not found`);
    }

    const server = await this.db.query.mcpServer.findFirst({
      where: (s) => eq(s.serverId, tool.serverId),
    });

    return this.toResponseDto(tool, server?.name || 'Unknown');
  }

  /**
   * Invoke an MCP tool
   */
  async invokeTool(params: {
    serverId: string;
    toolName: string;
    args: Record<string, any>;
  }): Promise<any> {
    try {
      this.logger.log(
        `Invoking MCP tool ${params.toolName} on server ${params.serverId}`,
      );

      // Get server
      const server = await this.db.query.mcpServer.findFirst({
        where: (s) => eq(s.serverId, params.serverId),
      });

      if (!server) {
        throw new BadRequestException(`Server ${params.serverId} not found`);
      }

      // Get connection
      const client = await this.connectionService.getConnection(server);

      // Call the tool
      const result = await client.callTool({
        name: params.toolName,
        arguments: params.args,
      });

      // Update usage stats
      await this.incrementUsage(params.serverId, params.toolName);

      this.logger.log(`MCP tool ${params.toolName} executed successfully`);

      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to invoke MCP tool ${params.toolName}: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to invoke MCP tool: ${error.message}`,
      );
    }
  }

  /**
   * Convert MCP tool to OpenAI ChatCompletionTool format
   */
  toOpenAIToolFormat(mcpTool: InferSelectModel<typeof schema.mcpTool>): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: mcpTool.toolName,
        description: mcpTool.description || '',
        parameters: mcpTool.inputSchema as any,
      },
    };
  }

  /**
   * Get all MCP tools in OpenAI ChatCompletionTool format
   */
  async getToolsForAgent(params: {
    ownerId: string;
    ownerType: 'user' | 'agent';
  }): Promise<ChatCompletionTool[]> {
    const mcpTools = await this.getToolsByOwner(params);

    const tools = await this.db.query.mcpTool.findMany({
      where: (t) => {
        const toolIds = mcpTools.map((mt) => mt.mcpToolId);
        return drizzleSql`${t.mcpToolId} = ANY(${toolIds}::uuid[])`;
      },
    });

    return tools.map((tool) => this.toOpenAIToolFormat(tool));
  }

  /* ─────────────────────────  PRIVATE HELPERS  ───────────────────────── */

  /**
   * Increment usage count for a tool
   */
  private async incrementUsage(
    serverId: string,
    toolName: string,
  ): Promise<void> {
    try {
      await this.db.execute(drizzleSql`
        UPDATE mcp_tool
        SET usage_count = usage_count + 1,
            last_used_at = timezone('utc', now())
        WHERE server_id = ${serverId}::uuid
          AND tool_name = ${toolName}
      `);
    } catch (error: any) {
      this.logger.error(
        `Failed to increment usage for ${toolName}: ${error.message}`,
      );
      // Don't throw - usage tracking shouldn't break tool execution
    }
  }

  /**
   * Convert database model to response DTO
   */
  private toResponseDto(
    tool: InferSelectModel<typeof schema.mcpTool>,
    serverName: string,
  ): McpToolResponseDto {
    return {
      mcpToolId: tool.mcpToolId,
      serverId: tool.serverId,
      serverName,
      toolName: tool.toolName,
      displayName: tool.displayName,
      description: tool.description,
      inputSchema: tool.inputSchema as any,
      isActive: tool.isActive || false,
      usageCount: tool.usageCount || 0,
      lastUsedAt: tool.lastUsedAt,
      createdAt: tool.createdAt,
      updatedAt: tool.updatedAt,
    };
  }
}
