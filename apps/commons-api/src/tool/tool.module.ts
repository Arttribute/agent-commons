import { forwardRef, Module } from '@nestjs/common';
import { AgentModule } from '../agent';
import { ResourceModule } from '../resource';
import { ToolController } from './tool.controller';
import { ToolService } from './tool.service';
import { CommonToolService } from './tools/common-tool.service';
import { EthereumToolService } from './tools/ethereum-tool.service';
import { GoalModule } from '../goal';
import { TaskModule } from '../task';
import { AttributionModule } from '../attribution';
import { PinataModule } from '~/pinata/pinata.module';
import { SpaceModule } from '~/space/space.module';

@Module({
  imports: [
    forwardRef(() => AgentModule),
    forwardRef(() => ResourceModule),
    //forwardRef(() => TaskModule),
    forwardRef(() => AttributionModule),
    forwardRef(() => PinataModule),
    forwardRef(() => GoalModule),
    forwardRef(() => TaskModule),
    forwardRef(() => SpaceModule),
  ],
  controllers: [ToolController],
  providers: [ToolService, EthereumToolService, CommonToolService, ToolService],
  exports: [EthereumToolService, CommonToolService, ToolService],
})
export class ToolModule {}
