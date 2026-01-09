import { forwardRef, Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolModule } from '../tool';
import { GoalModule } from '../goal';
import { TaskModule } from '../task';
import { AgentToolsController } from './agent-tools.controller';
import { SessionModule } from '~/session';
import { ResourceService } from '~/resource/resource.service';
import { EmbeddingService } from '~/embedding/embedding.service';
import { LogModule } from '~/log';
import { SpaceModule } from '~/space/space.module';
import { OAuthModule } from '~/oauth/oauth.module';
import { McpModule } from '~/mcp/mcp.module';

@Module({
  imports: [
    forwardRef(() => ToolModule),
    SessionModule,
    LogModule,
    GoalModule,
    TaskModule,
    forwardRef(() => SpaceModule),
    OAuthModule,
    McpModule,
  ],
  controllers: [AgentController, AgentToolsController],
  providers: [AgentService, ResourceService, EmbeddingService],
  exports: [AgentService],
})
export class AgentModule {}
