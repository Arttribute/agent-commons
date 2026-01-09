import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { ToolAccessService } from './tool-access.service';
import { ToolKeyService } from './tool-key.service';
import { McpToolDiscoveryService } from '../mcp/mcp-tool-discovery.service';
import type { ChatCompletionTool } from 'openai/resources';
import * as schema from '../../models/schema';

/**
 * Tool definition with endpoint for execution
 */
export interface ToolDefinition extends ChatCompletionTool {
  endpoint: string;
  toolId?: string;
  requiresKey?: boolean;
  hasKey?: boolean;
  category?: string;
}

/**
 * ToolLoaderService
 *
 * Centralized service for loading and building tool definitions for agents.
 * Replaces the scattered tool loading logic in agent.service.ts
 *
 * Responsibilities:
 * - Load static (platform) tools
 * - Load dynamic (user-created) tools with access control
 * - Load space-specific tools
 * - Resolve API keys for tools that require them
 * - Build complete tool definitions for LLM consumption
 */
@Injectable()
export class ToolLoaderService {
  private readonly logger = new Logger(ToolLoaderService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly toolAccess: ToolAccessService,
    private readonly toolKey: ToolKeyService,
    private readonly mcpToolDiscovery: McpToolDiscoveryService,
  ) {}

  /**
   * Load all tools accessible to an agent
   *
   * @param agentId - The agent ID
   * @param userId - The user who owns the agent (for user-level keys)
   * @param spaceId - Optional space ID for space-specific tools
   * @param staticToolDefs - Static tool definitions (from Typia/common-tools)
   * @param spaceToolDefs - Space-specific tool definitions (optional)
   * @returns Complete list of tool definitions
   */
  async loadToolsForAgent(params: {
    agentId: string;
    userId?: string;
    spaceId?: string;
    staticToolDefs: ChatCompletionTool[];
    spaceToolDefs?: ChatCompletionTool[];
    endpoint: string;
  }): Promise<ToolDefinition[]> {
    const { agentId, userId, spaceId, staticToolDefs, spaceToolDefs, endpoint } =
      params;

    this.logger.log(
      `Loading tools for agent ${agentId}${spaceId ? ` in space ${spaceId}` : ''}`,
    );

    const toolDefs: ToolDefinition[] = [];

    // 1. Add static (platform) tools - always available
    const staticDefs = staticToolDefs.map((tool) => ({
      ...tool,
      endpoint,
      category: 'platform',
    }));
    toolDefs.push(...staticDefs);

    this.logger.debug(`Loaded ${staticDefs.length} static tools`);

    // 2. Load dynamic tools from database with access control
    const dynamicDefs = await this.loadDynamicTools(agentId, userId, endpoint);
    toolDefs.push(...dynamicDefs);

    this.logger.debug(`Loaded ${dynamicDefs.length} dynamic tools`);

    // 3. Load agent-specific tools (from agent_tool mapping)
    const agentSpecificDefs = await this.loadAgentSpecificTools(
      agentId,
      endpoint,
    );
    toolDefs.push(...agentSpecificDefs);

    this.logger.debug(`Loaded ${agentSpecificDefs.length} agent-specific tools`);

    // 4. Load MCP tools (from MCP servers)
    const mcpDefs = await this.loadMcpTools(agentId, userId, endpoint);
    toolDefs.push(...mcpDefs);

    this.logger.debug(`Loaded ${mcpDefs.length} MCP tools`);

    // 5. Add space-specific tools if in a space
    if (spaceId && spaceToolDefs?.length) {
      const spaceDefs = spaceToolDefs.map((tool) => ({
        ...tool,
        endpoint,
        category: 'space',
      }));
      toolDefs.push(...spaceDefs);

      this.logger.debug(`Loaded ${spaceDefs.length} space tools`);
    }

    // 6. Resolve keys and mark tools that require/have keys
    await this.resolveToolKeys(toolDefs, agentId, userId);

    this.logger.log(
      `Total ${toolDefs.length} tools loaded for agent ${agentId}`,
    );

    return toolDefs;
  }

  /**
   * Load MCP tools from connected MCP servers
   *
   * @param agentId - The agent ID
   * @param userId - The user ID (for user-owned servers)
   * @param endpoint - Tool execution endpoint
   * @returns List of MCP tools
   */
  private async loadMcpTools(
    agentId: string,
    userId: string | undefined,
    endpoint: string,
  ): Promise<ToolDefinition[]> {
    try {
      // Get MCP tools for the owner (user or agent)
      const mcpTools = await this.mcpToolDiscovery.getToolsByOwner({
        ownerId: userId || agentId,
        ownerType: userId ? 'user' : 'agent',
      });

      // Convert MCP tools to ToolDefinition format
      return mcpTools.map((mcpTool) => ({
        type: 'function' as const,
        function: {
          name: mcpTool.toolName,
          description: mcpTool.description || '',
          parameters: mcpTool.inputSchema,
        },
        endpoint,
        toolId: mcpTool.mcpToolId,
        category: 'mcp',
        requiresKey: false, // MCP tools don't use our key system
        hasKey: true, // MCP servers handle their own auth
      }));
    } catch (error: any) {
      this.logger.error(`Failed to load MCP tools: ${error.message}`);
      return [];
    }
  }

  /**
   * Load dynamic tools from database with access control
   *
   * @param agentId - The agent ID
   * @param userId - The user ID (for user-level permissions)
   * @param endpoint - Tool execution endpoint
   * @returns List of accessible dynamic tools
   */
  private async loadDynamicTools(
    agentId: string,
    userId: string | undefined,
    endpoint: string,
  ): Promise<ToolDefinition[]> {
    try {
      // Get all accessible tools for the agent
      const accessibleTools = await this.toolAccess.getAccessibleTools(
        agentId,
        'agent',
      );

      // Also check user-level access if userId provided
      let userAccessibleTools: any[] = [];
      if (userId) {
        userAccessibleTools = await this.toolAccess.getAccessibleTools(
          userId,
          'user',
        );
      }

      // Combine and deduplicate
      const allAccessible = [
        ...accessibleTools,
        ...userAccessibleTools,
      ].filter((tool) => {
        // Filter out deprecated tools
        return !tool.isDeprecated;
      });

      // Remove duplicates based on toolId
      const uniqueTools = Array.from(
        new Map(allAccessible.map((t) => [t.toolId, t])).values(),
      );

      // Build tool definitions
      return uniqueTools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description:
            tool.description || tool.schema.function?.description || '',
          parameters:
            tool.schema.function?.parameters ||
            ({ type: 'object', properties: {} } as any),
        },
        endpoint,
        toolId: tool.toolId,
        category: tool.category || 'dynamic',
        requiresKey:
          tool.apiSpec?.authType &&
          tool.apiSpec.authType !== 'none' &&
          !!tool.apiSpec.authKeyName,
      }));
    } catch (error: any) {
      this.logger.error(`Failed to load dynamic tools: ${error.message}`);
      return [];
    }
  }

  /**
   * Load tools specifically mapped to an agent via agent_tool table
   *
   * @param agentId - The agent ID
   * @param endpoint - Tool execution endpoint
   * @returns List of agent-specific tools
   */
  private async loadAgentSpecificTools(
    agentId: string,
    endpoint: string,
  ): Promise<ToolDefinition[]> {
    try {
      // Get agent tool mappings
      const mappings = await this.db.query.agentTool.findMany({
        where: (at: any) => eq(at.agentId, agentId),
        with: {
          tool: true,
        },
      });

      // Filter enabled tools
      const enabledMappings = mappings.filter((m: any) => m.isEnabled);

      // Build tool definitions
      return (enabledMappings
        .map((mapping: any) => {
          const tool = mapping.tool;
          if (!tool || tool.isDeprecated) return null;

          return {
            type: 'function' as const,
            function: {
              name: tool.name,
              description:
                tool.description || tool.schema.function?.description || '',
              parameters:
                tool.schema.function?.parameters ||
                ({ type: 'object', properties: {} } as any),
            },
            endpoint,
            toolId: tool.toolId,
            category: tool.category || 'agent-specific',
            requiresKey:
              tool.apiSpec?.authType &&
              tool.apiSpec.authType !== 'none' &&
              !!tool.apiSpec.authKeyName,
          };
        })
        .filter((def: any) => def !== null)) as any[];
    } catch (error: any) {
      this.logger.error(
        `Failed to load agent-specific tools: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Resolve keys for tools and mark which ones have keys available
   *
   * @param toolDefs - List of tool definitions
   * @param agentId - The agent ID
   * @param userId - The user ID (optional)
   */
  private async resolveToolKeys(
    toolDefs: ToolDefinition[],
    agentId: string,
    userId?: string,
  ) {
    for (const toolDef of toolDefs) {
      if (!toolDef.requiresKey || !toolDef.toolId) {
        toolDef.hasKey = false;
        continue;
      }

      try {
        // Try to resolve key (agent-specific → user-specific → global)
        const key = await this.toolKey.resolveKeyForTool(
          toolDef.toolId,
          agentId,
          userId,
        );

        toolDef.hasKey = !!key;
      } catch (error: any) {
        this.logger.warn(
          `Failed to resolve key for tool ${toolDef.toolId}: ${error.message}`,
        );
        toolDef.hasKey = false;
      }
    }
  }

  /**
   * Get a specific tool definition by name
   *
   * @param toolName - The tool name
   * @param agentId - The agent ID
   * @param userId - The user ID (optional)
   * @returns Tool definition or null
   */
  async getToolByName(
    toolName: string,
    agentId: string,
    userId?: string,
  ): Promise<ToolDefinition | null> {
    try {
      // Check if it's a resource tool (resourceTool_{resourceId})
      if (toolName.startsWith('resourceTool_')) {
        const resourceId = toolName.replace('resourceTool_', '');
        return this.loadResourceTool(resourceId);
      }

      // Look up in tool table
      const tool = await this.db.query.tool.findFirst({
        where: (t: any) => eq(t.name, toolName),
      });

      if (!tool) {
        return null;
      }

      // Check access
      const canExecute = await this.toolAccess.canExecuteTool(
        tool.toolId,
        agentId,
        'agent',
      );

      if (!canExecute) {
        return null;
      }

      // Build tool definition
      const toolDef: ToolDefinition = {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description || tool.schema.function?.description || '',
          parameters:
            tool.schema.function?.parameters ||
            ({ type: 'object', properties: {} } as any),
        },
        endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
        toolId: tool.toolId,
        category: tool.category || 'dynamic',
        requiresKey:
          tool.apiSpec?.authType &&
          tool.apiSpec.authType !== 'none' &&
          !!tool.apiSpec.authKeyName,
      };

      // Resolve key
      if (toolDef.requiresKey && toolDef.toolId) {
        const key = await this.toolKey.resolveKeyForTool(
          toolDef.toolId,
          agentId,
          userId,
        );
        toolDef.hasKey = !!key;
      }

      return toolDef;
    } catch (error: any) {
      this.logger.error(
        `Failed to get tool by name ${toolName}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Load a resource tool (legacy support for resource-based tools)
   *
   * @param resourceId - The resource ID
   * @returns Tool definition or null
   */
  private async loadResourceTool(
    resourceId: string,
  ): Promise<ToolDefinition | null> {
    try {
      const resource = await this.db.query.resource.findFirst({
        where: (r) => eq(r.resourceId, resourceId),
      });

      if (!resource || !resource.schema) {
        return null;
      }

      return {
        type: 'function' as const,
        function: {
          name: `resourceTool_${resourceId}`,
          ...(resource.schema as any),
        },
        endpoint: `http://localhost:${process.env.PORT}/v1/agents/tools`,
        category: 'resource',
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to load resource tool ${resourceId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get tool metadata including access and key status
   *
   * @param toolId - The tool ID
   * @param agentId - The agent ID
   * @param userId - The user ID (optional)
   * @returns Tool metadata
   */
  async getToolMetadata(toolId: string, agentId: string, userId?: string) {
    const tool = await this.db.query.tool.findFirst({
      where: (t: any) => eq(t.toolId, toolId),
    });

    if (!tool) {
      return null;
    }

    // Check access
    const accessCheck = await this.toolAccess.checkAgentToolAccess(
      toolId,
      agentId,
      userId,
    );

    // Check key availability if required
    let hasKey = false;
    if (accessCheck.requiresKey) {
      const key = await this.toolKey.resolveKeyForTool(toolId, agentId, userId);
      hasKey = !!key;
    }

    return {
      ...tool,
      ...accessCheck,
      hasKey,
    };
  }

  /**
   * Filter tool definitions to only include those with available keys
   * Useful when an agent should only see tools they can actually use
   *
   * @param toolDefs - List of tool definitions
   * @returns Filtered list with only usable tools
   */
  filterUsableTools(toolDefs: ToolDefinition[]): ToolDefinition[] {
    return toolDefs.filter((tool) => {
      // Include tools that don't require keys
      if (!tool.requiresKey) {
        return true;
      }

      // Only include tools with keys available
      return tool.hasKey;
    });
  }
}
