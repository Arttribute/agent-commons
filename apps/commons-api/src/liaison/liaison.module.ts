// src/liaison/liaison.module.ts
import { Module } from '@nestjs/common';
import { LiaisonService } from './liaison.service';
import { LiaisonController } from './liaison.controller';
import { AgentService } from '~/agent/agent.service';
import { SessionService } from '~/session/session.service';
import { ToolService } from '~/tool/tool.service';
import { AgentModule } from '~/agent';
import { SessionModule } from '~/session';
import { ToolModule } from '~/tool';

@Module({
  imports: [AgentModule, SessionModule, ToolModule],
  controllers: [LiaisonController],
  providers: [LiaisonService],
  exports: [LiaisonService],
})
export class LiaisonModule {}
