import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AgentModule } from './agent';
import { PinataModule } from './pinata/pinata.module';
import { ToolModule } from './tool';
import { ResourceModule } from './resource';
import { DatabaseModule } from './modules/database';
import { OpenAIModule } from './modules/openai';
import { CoinbaseModule } from './modules/coinbase';
import { EmbeddingModule } from './embedding/embedding.module';

@Module({
  imports: [
    // Global modules
    OpenAIModule,
    DatabaseModule,
    PinataModule,
    CoinbaseModule,

    PinataModule,
    EmbeddingModule,

    // Feature modules
    AgentModule,
    ToolModule,
    ResourceModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
