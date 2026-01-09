import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database/database.module';
import { McpServerService } from './mcp-server.service';
import { McpConnectionService } from './mcp-connection.service';
import { McpToolDiscoveryService } from './mcp-tool-discovery.service';
import { McpServerController } from './mcp-server.controller';
import { McpToolController } from './mcp-tool.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [McpServerController, McpToolController],
  providers: [
    McpServerService,
    McpConnectionService,
    McpToolDiscoveryService,
  ],
  exports: [
    McpServerService,
    McpConnectionService,
    McpToolDiscoveryService,
  ],
})
export class McpModule {}
