import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database';
import { ModelProviderModule } from '~/modules/model-provider';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { OwnerGuard } from '~/modules/auth';

@Module({
  imports: [DatabaseModule, ModelProviderModule],
  controllers: [MemoryController],
  providers: [MemoryService, OwnerGuard],
  exports: [MemoryService],
})
export class MemoryModule {}
