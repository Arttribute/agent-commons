import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database';
import { ModelProviderModule } from '~/modules/model-provider';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';

@Module({
  imports: [DatabaseModule, ModelProviderModule],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
