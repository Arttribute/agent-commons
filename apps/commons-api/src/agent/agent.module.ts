import { forwardRef, Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolModule } from '../tool';
import { AgentToolsController } from './agent-tools.controller';
import { SessionModule } from '~/session';
import { ResourceService } from '~/resource/resource.service';
import { EmbeddingService } from '~/embedding/embedding.service';
import { LogModule } from '~/log';

@Module({
  imports: [forwardRef(() => ToolModule), SessionModule, LogModule],
  controllers: [AgentController, AgentToolsController],
  providers: [AgentService, ResourceService, EmbeddingService],
  exports: [AgentService],
})
export class AgentModule {}
