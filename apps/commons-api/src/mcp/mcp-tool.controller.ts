import { Controller, Get, Param, Query } from '@nestjs/common';
import { McpToolDiscoveryService } from './mcp-tool-discovery.service';
import {
  McpToolResponseDto,
  McpToolListResponseDto,
} from './dto/mcp.dto';

@Controller({ version: '1', path: 'mcp/tools' })
export class McpToolController {
  constructor(private readonly toolDiscovery: McpToolDiscoveryService) {}

  /**
   * Get all MCP tools for an owner
   */
  @Get()
  async getToolsByOwner(
    @Query('ownerId') ownerId: string,
    @Query('ownerType') ownerType: 'user' | 'agent' = 'user',
  ): Promise<McpToolListResponseDto> {
    const tools = await this.toolDiscovery.getToolsByOwner({
      ownerId,
      ownerType,
    });

    return {
      tools,
      total: tools.length,
    };
  }

  /**
   * Get a specific MCP tool
   */
  @Get(':mcpToolId')
  async getTool(
    @Param('mcpToolId') mcpToolId: string,
  ): Promise<McpToolResponseDto> {
    return await this.toolDiscovery.getTool(mcpToolId);
  }
}
