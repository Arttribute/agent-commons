import { forwardRef, Module } from '@nestjs/common';
import { ToolController } from './tool.controller';
import { ToolService } from './tool.service';
import { EthereumToolService } from './tools/ethereum-tool.service';
import { CommonToolService } from './tools/common-tool.service';
import { ResourceToolService } from './tools/resource-tool.service';
import { AgentModule } from '../agent';

@Module({
  imports: [forwardRef(() => AgentModule)],
  controllers: [ToolController],
  providers: [
    ToolService,
    EthereumToolService,
    CommonToolService,
    ResourceToolService,
  ],
  exports: [EthereumToolService, CommonToolService, ResourceToolService],
})
export class ToolModule {}
