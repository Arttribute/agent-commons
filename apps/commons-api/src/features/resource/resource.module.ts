import { forwardRef, Module } from '@nestjs/common';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';
import { AgentModule } from '../agent';

@Module({
  imports: [forwardRef(() => AgentModule)],
  controllers: [ResourceController],
  providers: [ResourceService],
  exports: [ResourceService],
})
export class ResourceModule {}
