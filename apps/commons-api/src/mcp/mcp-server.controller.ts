import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { McpServerService } from './mcp-server.service';
import { McpConnectionService } from './mcp-connection.service';
import { McpToolDiscoveryService } from './mcp-tool-discovery.service';
import {
  CreateMcpServerDto,
  UpdateMcpServerDto,
  SyncMcpToolsDto,
  McpServerResponseDto,
  McpServerListResponseDto,
  McpStatusResponseDto,
  McpSyncResponseDto,
} from './dto/mcp.dto';

@Controller({ version: '1', path: 'mcp/servers' })
export class McpServerController {
  constructor(
    private readonly serverService: McpServerService,
    private readonly connectionService: McpConnectionService,
    private readonly toolDiscovery: McpToolDiscoveryService,
  ) {}

  /**
   * Create a new MCP server
   */
  @Post()
  async createServer(
    @Body() dto: CreateMcpServerDto,
    @Query('ownerId') ownerId: string,
    @Query('ownerType') ownerType: 'user' | 'agent' = 'user',
  ): Promise<McpServerResponseDto> {
    return await this.serverService.createServer({
      ownerId,
      ownerType,
      dto,
    });
  }

  /**
   * List MCP servers for an owner
   */
  @Get()
  async listServers(
    @Query('ownerId') ownerId: string,
    @Query('ownerType') ownerType: 'user' | 'agent' = 'user',
  ): Promise<McpServerListResponseDto> {
    const servers = await this.serverService.listServers({
      ownerId,
      ownerType,
    });

    return {
      servers,
      total: servers.length,
    };
  }

  /**
   * Get public MCP servers (marketplace)
   */
  @Get('marketplace')
  async getMarketplace(): Promise<McpServerListResponseDto> {
    const servers = await this.serverService.listPublicServers();

    return {
      servers,
      total: servers.length,
    };
  }

  /**
   * Get a specific MCP server
   */
  @Get(':serverId')
  async getServer(
    @Param('serverId') serverId: string,
  ): Promise<McpServerResponseDto> {
    return await this.serverService.getServer(serverId);
  }

  /**
   * Update an MCP server
   */
  @Put(':serverId')
  async updateServer(
    @Param('serverId') serverId: string,
    @Body() dto: UpdateMcpServerDto,
  ): Promise<McpServerResponseDto> {
    return await this.serverService.updateServer(serverId, dto);
  }

  /**
   * Delete an MCP server
   */
  @Delete(':serverId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteServer(@Param('serverId') serverId: string): Promise<void> {
    await this.serverService.deleteServer(serverId);
  }

  /**
   * Connect to an MCP server
   */
  @Post(':serverId/connect')
  async connect(
    @Param('serverId') serverId: string,
  ): Promise<McpStatusResponseDto> {
    const serverDto = await this.serverService.getServer(serverId);
    const server = await this.serverService['db'].query.mcpServer.findFirst({
      where: (s: any, { eq }: any) => eq(s.serverId, serverId),
    });

    await this.connectionService.connect(server as any);

    return {
      connected: true,
      capabilities: server?.capabilities
        ? Object.keys(server.capabilities)
        : [],
      toolsDiscovered: serverDto.toolsCount,
      lastConnectedAt: new Date(),
      lastError: null,
    };
  }

  /**
   * Disconnect from an MCP server
   */
  @Post(':serverId/disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@Param('serverId') serverId: string): Promise<void> {
    await this.connectionService.disconnect(serverId);
  }

  /**
   * Get server connection status
   */
  @Get(':serverId/status')
  async getStatus(
    @Param('serverId') serverId: string,
  ): Promise<McpStatusResponseDto> {
    const server = await this.serverService.getServer(serverId);
    const connected = this.connectionService.isConnected(serverId);

    return {
      connected,
      capabilities: server.capabilities
        ? Object.keys(server.capabilities)
        : [],
      toolsDiscovered: server.toolsCount,
      lastConnectedAt: server.lastConnectedAt,
      lastError: server.lastError,
    };
  }

  /**
   * Sync tools from MCP server
   */
  @Post(':serverId/sync')
  async syncTools(
    @Param('serverId') serverId: string,
    @Body() dto: SyncMcpToolsDto,
  ): Promise<McpSyncResponseDto> {
    return await this.toolDiscovery.syncTools(serverId);
  }

  /**
   * Get tools for a server
   */
  @Get(':serverId/tools')
  async getTools(@Param('serverId') serverId: string) {
    const tools = await this.toolDiscovery.getToolsByServer(serverId);

    return {
      tools,
      total: tools.length,
    };
  }
}
