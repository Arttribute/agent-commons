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
import { EncryptionModule } from './modules/encryption';
import { EmbeddingModule } from './embedding/embedding.module';
import { LiaisonModule } from './liaison/liaison.module';
import { SpaceModule } from './space/space.module';

@Module({
  imports: [
    // Global modules
    DatabaseModule,
    OpenAIModule,
    CoinbaseModule,
    EncryptionModule,
    PinataModule,
    EmbeddingModule,

    // Feature modules
    AgentModule,
    ToolModule,
    ResourceModule,
    LiaisonModule,
    SpaceModule,
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
