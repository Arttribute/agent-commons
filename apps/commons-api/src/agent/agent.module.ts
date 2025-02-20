import { forwardRef, Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolModule } from '../tool';
import { AgentToolsController } from './agent-tools.controller';

@Module({
  imports: [forwardRef(() => ToolModule)],
  controllers: [AgentController, AgentToolsController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
