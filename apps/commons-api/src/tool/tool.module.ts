import { forwardRef, Module } from '@nestjs/common';
import { AgentModule } from '../agent';
import { ResourceModule } from '../resource';
import { ToolController } from './tool.controller';
import { WorkflowController } from './workflow.controller';
import { ToolKeyController } from './tool-key.controller';
import { ToolPermissionController } from './tool-permission.controller';
import { ToolService } from './tool.service';
import { CommonToolService } from './tools/common-tool.service';
import { EthereumToolService } from './tools/ethereum-tool.service';
import { ToolKeyService } from './tool-key.service';
import { ToolAccessService } from './tool-access.service';
import { ToolLoaderService } from './tool-loader.service';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutorService } from './workflow-executor.service';
import { GoalModule } from '../goal';
import { TaskModule } from '../task';
import { AttributionModule } from '../attribution';
import { PinataModule } from '~/pinata/pinata.module';
import { SpaceModule } from '../space/space.module';

@Module({
  imports: [
    forwardRef(() => AgentModule),
    forwardRef(() => ResourceModule),
    forwardRef(() => AttributionModule),
    forwardRef(() => PinataModule),
    forwardRef(() => GoalModule),
    forwardRef(() => TaskModule),
    forwardRef(() => SpaceModule),
  ],
  controllers: [
    ToolController,
    WorkflowController,
    ToolKeyController,
    ToolPermissionController,
  ],
  providers: [
    ToolService,
    EthereumToolService,
    CommonToolService,
    ToolKeyService,
    ToolAccessService,
    ToolLoaderService,
    WorkflowService,
    WorkflowExecutorService,
  ],
  exports: [
    EthereumToolService,
    CommonToolService,
    ToolService,
    ToolKeyService,
    ToolAccessService,
    ToolLoaderService,
    WorkflowService,
    WorkflowExecutorService,
  ],
})
export class ToolModule {}
