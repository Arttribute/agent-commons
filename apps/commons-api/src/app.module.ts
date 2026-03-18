import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RateLimitGuard } from './modules/auth';

import { AgentModule } from './agent';
import { PinataModule } from './pinata/pinata.module';
import { ToolModule } from './tool';
import { ResourceModule } from './resource';
import { DatabaseModule } from './modules/database';
import { OpenAIModule } from './modules/openai';
import { EncryptionModule } from './modules/encryption';
import { ModelProviderModule } from './modules/model-provider';
import { EmbeddingModule } from './embedding/embedding.module';
import { LiaisonModule } from './liaison/liaison.module';
import { SpaceModule } from './space/space.module';
import { OAuthModule } from './oauth/oauth.module';
import { McpModule } from './mcp/mcp.module';
import { TaskModule } from './task';
import { A2aModule } from './a2a/a2a.module';
import { SkillModule } from './skill/skill.module';
import { UsageModule } from './modules/usage';
import { MemoryModule } from './memory/memory.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    // Infrastructure modules (global)
    DatabaseModule,
    OpenAIModule,
    EncryptionModule,
    ModelProviderModule,   // Global model provider factory
    PinataModule,
    EmbeddingModule,

    // Feature modules
    AgentModule,
    ToolModule,
    TaskModule,
    ResourceModule,
    LiaisonModule,
    SpaceModule,
    OAuthModule,
    McpModule,
    A2aModule,
    SkillModule,
    UsageModule,
    MemoryModule,
    WalletModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    // Global rate-limit guard (120 req/min per agent by default)
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
