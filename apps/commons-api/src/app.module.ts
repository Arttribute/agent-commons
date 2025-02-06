import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PinataModule } from './pinata/pinata.module';
import { EmbeddingModule } from './embedding/embedding.module';

@Module({
  imports: [PinataModule, EmbeddingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
