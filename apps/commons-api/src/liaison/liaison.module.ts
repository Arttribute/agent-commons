// src/liaison/liaison.module.ts
import { Module } from '@nestjs/common';
import { LiaisonService } from './liaison.service';
import { LiaisonController } from './liaison.controller';
import { AgentService } from '~/agent/agent.service';
import { DatabaseService } from '~/modules/database/database.service';
import { CoinbaseService } from '~/modules/coinbase/coinbase.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { SessionService } from '~/session/session.service';
import { ToolService } from '~/tool/tool.service';

@Module({
  imports: [],
  controllers: [LiaisonController],
  providers: [
    LiaisonService,
    DatabaseService,
    CoinbaseService,
    OpenAIService,
    AgentService,
    SessionService,
    ToolService,
  ],
  exports: [LiaisonService],
})
export class LiaisonModule {}
