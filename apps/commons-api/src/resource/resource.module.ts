import { forwardRef, Module } from '@nestjs/common';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';
import { AgentModule } from '../agent';
import { EmbeddingModule } from '~/embedding/embedding.module';
import { EmbeddingService } from '~/embedding/embedding.service';

@Module({
  imports: [forwardRef(() => AgentModule), EmbeddingModule],
  controllers: [ResourceController],
  providers: [ResourceService, EmbeddingService],
  exports: [ResourceService],
})
export class ResourceModule {}
