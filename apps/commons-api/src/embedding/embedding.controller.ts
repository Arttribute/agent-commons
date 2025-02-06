import { Controller, Post, Body } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { CreateEmbeddingDto } from './dto/create-embedding.dto';

@Controller('embedding')
export class EmbeddingController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @Post() // /embedding
  create(@Body() createEmbeddingDto: CreateEmbeddingDto) {
    return this.embeddingService.create(createEmbeddingDto);
  }

  @Post('find') // /embedding/find
  find(@Body() createEmbeddingDto: CreateEmbeddingDto) {
    return this.embeddingService.find(createEmbeddingDto);
  }
}
