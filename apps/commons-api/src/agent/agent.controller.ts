import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { TypedBody } from '@nestia/core';
import * as schema from '#/models/schema';
import { InferInsertModel } from 'drizzle-orm';
import { Except } from 'type-fest';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

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

  @Post(':agentId/trigger')
  async triggerAgent(@Param('agentId') agentId: string) {
    this.agent.triggerAgent({ agentId });
    return {
      message:
        'Agent trigger sent.Make sure you have enabled agent autonomy for the trigger to work',
    };
  }

  async pauseAgent(@Param('agentId') agentId: string) {
    //
  }

  @Get(':agentId')
  async getAgent(@Param('agentId') agentId: string) {
    const agent = await this.agent.getAgent({ agentId });
    if (!agent) {
      throw new BadRequestException('Agent not found');
    }
    return { data: agent };
  }

  @Get()
  async getAgents(@Query('owner') owner?: string) {
    if (owner) {
      const ownedAgents = await this.agent.getAgentsByOwner(owner);
      return { data: ownedAgents };
    } else {
      const agents = await this.agent.getAgents();
      return { data: agents };
    }
  }

  /**
   * PUT /v1/agents/:agentId
   * Update an agent's data in the DB
   */
  @Put(':agentId')
  async updateAgent(@Param('agentId') agentId: string, @Body() body: any) {
    const updated = await this.agent.updateAgent(agentId, body);
    if (!updated) {
      throw new BadRequestException('Unable to update agent');
    }
    return { data: updated };
  }
}
