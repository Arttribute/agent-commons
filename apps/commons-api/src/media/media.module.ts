import { Module } from '@nestjs/common';
import { FilesModule } from '~/files';
import { UsageModule } from '~/modules/usage';
import { ProvenanceModule } from '~/provenance';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';
import { MediaService } from './media.service';
import { MediaEditService } from './media-edit.service';
import { CanvasVisualsService } from './canvas-visuals.service';
import { OpenAIServiceProvider } from '~/modules/openai/openai.service';
import { GoogleMediaProvider } from './providers/google-media.provider';
import { KlingMediaProvider } from './providers/kling-media.provider';
import { BytePlusMediaProvider } from './providers/byteplus-media.provider';
import { OpenAIMediaProvider } from './providers/openai-media.provider';

@Module({
  imports: [FilesModule, UsageModule, ProvenanceModule],
  controllers: [CanvasController],
  providers: [
    CanvasService,
    MediaService,
    MediaEditService,
    CanvasVisualsService,
    OpenAIServiceProvider,
    GoogleMediaProvider,
    KlingMediaProvider,
    BytePlusMediaProvider,
    OpenAIMediaProvider,
  ],
  exports: [CanvasService, MediaService, MediaEditService, CanvasVisualsService],
})
export class MediaModule {}
