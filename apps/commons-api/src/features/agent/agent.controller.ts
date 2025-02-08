import { Body, Controller, Get, Post } from '@nestjs/common';
import { AgentService } from './agent.service';
import { TypedBody } from '@nestia/core';
import * as schema from '#/models/schema';
import { InferInsertModel } from 'drizzle-orm';
import { Except } from 'type-fest';

@Controller({ version: '1', path: 'agents' })
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post()
  async createAgent(
    @TypedBody()
    body: Except<
      InferInsertModel<typeof schema.agent>,
      'wallet' | 'agentId' | 'createdAt'
    > & { commonsOwned?: boolean },
  ) {
    const agent = await this.agent.createAgent({
      value: body as InferInsertModel<typeof schema.agent>,
      commonsOwned: body.commonsOwned,
    });
    return { data: agent };
  }

  @Post('run')
  async runAgent(@Body() body: any) {
    const response = await this.agent.runAgent(body);
    return { data: response };
  }

  //get all agents
  @Get()
  async getAgents() {
    const agents = await this.agent.getAgents();
    return { data: agents };
  }
}
