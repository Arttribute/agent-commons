import { Module } from '@nestjs/common';
import { BrainController } from './brain.controller';
import {
  BrowserFilesystemKnowledgeProvider,
  KnowledgeProviderRegistry,
  NativeKnowledgeProvider,
} from './brain.provider';
import { BrainService } from './brain.service';

@Module({
  controllers: [BrainController],
  providers: [
    BrainService,
    NativeKnowledgeProvider,
    BrowserFilesystemKnowledgeProvider,
    KnowledgeProviderRegistry,
  ],
  exports: [BrainService, KnowledgeProviderRegistry],
})
export class BrainModule {}
