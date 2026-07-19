import { forwardRef, Module } from '@nestjs/common';
import { AgentModule } from '../agent';
import { ToolController } from './tool.controller';
import { WorkflowController } from './workflow.controller';
import { ToolKeyController } from './tool-key.controller';
import { ToolPermissionController } from './tool-permission.controller';
import { ToolService } from './tool.service';
import { CommonToolService } from './tools/common-tool.service';
import { ToolKeyService } from './tool-key.service';
import { ToolAccessService } from './tool-access.service';
import { ToolLoaderService } from './tool-loader.service';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutorService } from './workflow-executor.service';
import { GoalModule } from '../goal';
import { TaskModule } from '../task';
import { PinataModule } from '~/pinata/pinata.module';
import { SpaceModule } from '../space/space.module';
import { McpModule } from '../mcp/mcp.module';
import { SkillModule } from '../skill/skill.module';
import { OwnerGuard } from '~/modules/auth';
import { EthereumToolService } from './tools/ethereum-tool.service';
import { FilesModule } from '~/files';
import { ComputerModule } from '~/computer';
import { CodeProjectModule } from '~/code-project';
import { UsageModule } from '~/modules/usage';

@Module({
  imports: [
    forwardRef(() => AgentModule),
    forwardRef(() => PinataModule),
    forwardRef(() => GoalModule),
    forwardRef(() => TaskModule),
    forwardRef(() => SpaceModule),
    McpModule,
    SkillModule,
    FilesModule,
    ComputerModule,
    CodeProjectModule,
    UsageModule,
  ],
  controllers: [
    ToolController,
    WorkflowController,
    ToolKeyController,
    ToolPermissionController,
  ],
  providers: [
    ToolService,
    CommonToolService,
    ToolKeyService,
    ToolAccessService,
    ToolLoaderService,
    WorkflowService,
    WorkflowExecutorService,
    EthereumToolService,
    OwnerGuard,
  ],
  exports: [
    CommonToolService,
    ToolService,
    ToolKeyService,
    ToolAccessService,
    ToolLoaderService,
    WorkflowService,
    WorkflowExecutorService,
    EthereumToolService,
  ],
})
export class ToolModule {
  // Static tools are kept in memory only, not synced to database
}
