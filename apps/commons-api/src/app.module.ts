import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth';

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
import { LogModule } from './log/log.module';
import { X402Module } from './modules/x402';
import { ActivityModule } from './activity/activity.module';
import { CreditModule } from './credit';
import { FilesModule } from './files';
import { ComputerModule } from './computer';
import { AudioModule } from './audio';

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
    ActivityModule,
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
    CreditModule,
    FilesModule,
    ComputerModule,
    AudioModule,
    MemoryModule,
    WalletModule,
    LogModule,
    X402Module,     // Global x402 micropayment guard
    AuthModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    // Global guards (ApiKeyGuard then RateLimitGuard) live in AuthModule so
    // their execution order is deterministic.
  ],
})
export class AppModule {}
