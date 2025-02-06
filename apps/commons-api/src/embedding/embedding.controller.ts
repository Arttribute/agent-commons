import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { EmbeddingDto } from './dto/embedding.dto';

@Controller('embedding')
export class EmbeddingController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @Post()
  create(@Body() createEmbeddingDto: EmbeddingDto) {
    return this.embeddingService.create(createEmbeddingDto);
  }

  @Post('find')
  @HttpCode(200)
  find(@Body() searchEmbeddingDto: EmbeddingDto) {
    return this.embeddingService.find(searchEmbeddingDto);
  }
}
