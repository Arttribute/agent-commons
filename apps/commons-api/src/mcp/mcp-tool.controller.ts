import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { McpToolDiscoveryService } from './mcp-tool-discovery.service';
import { McpOwnerGuard, type McpRequest } from './mcp-owner.guard';
import {
  McpToolResponseDto,
  McpToolListResponseDto,
} from './dto/mcp.dto';

@Controller({ version: '1', path: 'mcp/tools' })
@UseGuards(McpOwnerGuard)
export class McpToolController {
  constructor(private readonly toolDiscovery: McpToolDiscoveryService) {}

  /**
   * Get all MCP tools for an owner
   */
  @Get()
  async getToolsByOwner(
    @Req() req: McpRequest,
  ): Promise<McpToolListResponseDto> {
    const tools = await this.toolDiscovery.getToolsByOwner({
      ...req.mcpOwner!,
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
