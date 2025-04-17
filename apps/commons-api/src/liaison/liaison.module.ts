// src/liaison/liaison.module.ts
import { Module } from '@nestjs/common';
import { AgentModule } from '~/agent';
import { SessionModule } from '~/session';
import { ToolModule } from '~/tool';
import { LiaisonController } from './liaison.controller';
import { LiaisonService } from './liaison.service';

@Module({
  imports: [AgentModule, SessionModule, ToolModule],
  controllers: [LiaisonController],
  providers: [LiaisonService],
  exports: [LiaisonService],
})
export class LiaisonModule {}
