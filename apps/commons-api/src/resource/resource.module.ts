import { Module } from '@nestjs/common';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';
import { EmbeddingModule } from '~/embedding/embedding.module';
import { EmbeddingService } from '~/embedding/embedding.service';

@Module({
  imports: [EmbeddingModule],
  controllers: [ResourceController],
  providers: [ResourceService, EmbeddingService],
  exports: [ResourceService],
})
export class ResourceModule {}
