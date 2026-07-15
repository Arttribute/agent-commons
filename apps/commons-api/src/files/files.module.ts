import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { LibraryController, SharedArtifactController } from './library.controller';
import { LibraryService } from './library.service';
import { PinataModule } from '~/pinata/pinata.module';

@Module({
  imports: [PinataModule],
  controllers: [FilesController, LibraryController, SharedArtifactController],
  providers: [FilesService, LibraryService],
  exports: [FilesService, LibraryService],
})
export class FilesModule {}
