import { forwardRef, Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { HeartbeatService } from './heartbeat.service';
import { ToolModule } from '../tool';
import { TaskModule } from '../task';
import { AgentToolsController } from './agent-tools.controller';
import { SessionModule } from '~/session';
import { ResourceService } from '~/resource/resource.service';
import { EmbeddingService } from '~/embedding/embedding.service';
import { LogModule } from '~/log';
import { SpaceModule } from '~/space/space.module';
import { OAuthModule } from '~/oauth/oauth.module';
import { McpModule } from '~/mcp/mcp.module';
import { OwnerGuard } from '~/modules/auth';
import { UsageModule } from '~/modules/usage';
import { MemoryModule } from '~/memory/memory.module';
import { WalletModule } from '~/wallet/wallet.module';

@Module({
  imports: [
    forwardRef(() => ToolModule),
    SessionModule,
    LogModule,
    forwardRef(() => TaskModule),
    forwardRef(() => SpaceModule),
    OAuthModule,
    McpModule,
    UsageModule,
    MemoryModule,
    WalletModule,
  ],
  controllers: [AgentController, AgentToolsController],
  providers: [AgentService, HeartbeatService, ResourceService, EmbeddingService, OwnerGuard],
  exports: [AgentService, HeartbeatService],
})
export class AgentModule {}
