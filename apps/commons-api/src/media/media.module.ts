import { Module } from '@nestjs/common';
import { FilesModule } from '~/files';
import { UsageModule } from '~/modules/usage';
import { ProvenanceModule } from '~/provenance';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';
import { MediaService } from './media.service';
import { GoogleMediaProvider } from './providers/google-media.provider';
import { KlingMediaProvider } from './providers/kling-media.provider';
import { BytePlusMediaProvider } from './providers/byteplus-media.provider';

@Module({
  imports: [FilesModule, UsageModule, ProvenanceModule],
  controllers: [CanvasController],
  providers: [
    CanvasService,
    MediaService,
    GoogleMediaProvider,
    KlingMediaProvider,
    BytePlusMediaProvider,
  ],
  exports: [CanvasService, MediaService],
})
export class MediaModule {}
