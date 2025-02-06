import {
  Controller,
  Post,
  Body,
  // UseInterceptors,
  // UploadedFile,
  HttpCode,
} from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { EmbeddingDto } from './dto/embedding.dto';
// import { FileInterceptor } from '@nestjs/platform-express';

@Controller('embedding')
export class EmbeddingController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @Post()
  // @UseInterceptors(FileInterceptor('file'))
  create(
    @Body() createEmbeddingDto: EmbeddingDto,
    // @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.embeddingService.create(createEmbeddingDto);
  }

  @Post('find')
  @HttpCode(200)
  // @UseInterceptors(FileInterceptor('file'))
  find(
    // @UploadedFile() file?: Express.Multer.File,
    @Body() searchEmbeddingDto: EmbeddingDto,
  ) {
    return this.embeddingService.find(searchEmbeddingDto);
  }
}
