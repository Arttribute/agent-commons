import { forwardRef, Module } from '@nestjs/common';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';
import { AgentModule } from '../agent';
import { EmbeddingModule } from '~/embedding/embedding.module';

@Module({
  imports: [forwardRef(() => AgentModule), EmbeddingModule],
  controllers: [ResourceController],
  providers: [ResourceService],
  exports: [ResourceService],
})
export class ResourceModule {}
