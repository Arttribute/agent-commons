import { forwardRef, Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { HeartbeatService } from './heartbeat.service';
import { RunStreamRegistry } from './run-stream.registry';
import { ToolModule } from '../tool';
import { TaskModule } from '../task';
import { AgentToolsController } from './agent-tools.controller';
import { SessionModule } from '~/session';
import { LogModule } from '~/log';
import { SpaceModule } from '~/space/space.module';
import { OAuthModule } from '~/oauth/oauth.module';
import { McpModule } from '~/mcp/mcp.module';
import { OwnerGuard } from '~/modules/auth';
import { UsageModule } from '~/modules/usage';
import { MemoryModule } from '~/memory/memory.module';
import { WalletModule } from '~/wallet/wallet.module';
import { FilesModule } from '~/files';
import { ComputerModule } from '~/computer';
import { PinataModule } from '~/pinata/pinata.module';
import { SkillModule } from '~/skill/skill.module';
import { RuntimeController } from './runtime/runtime.controller';
import { RuntimeMigrationService } from './runtime/runtime-migration.service';
import { RuntimeManagementService } from './runtime/runtime-management.service';
import { ExternalRuntimeService } from './runtime/external-runtime.service';
import { RuntimeDispatcherService } from './runtime/runtime-dispatcher.service';
import { RuntimeToolBridgeController } from './runtime/runtime-tool-bridge.controller';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';

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
    FilesModule,
    ComputerModule,
    PinataModule,
    SkillModule,
  ],
  controllers: [
    AgentController,
    AgentToolsController,
    RuntimeController,
    RuntimeToolBridgeController,
    CopilotController,
  ],
  providers: [
    AgentService,
    HeartbeatService,
    RunStreamRegistry,
    OwnerGuard,
    RuntimeMigrationService,
    RuntimeManagementService,
    ExternalRuntimeService,
    RuntimeDispatcherService,
    CopilotService,
  ],
  exports: [
    AgentService,
    HeartbeatService,
    RunStreamRegistry,
    RuntimeManagementService,
    ExternalRuntimeService,
    RuntimeDispatcherService,
    CopilotService,
  ],
})
export class AgentModule {}
