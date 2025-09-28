import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Sse,
  Headers,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { TypedBody } from '@nestia/core';
import * as schema from '#/models/schema';
import { InferInsertModel } from 'drizzle-orm';
import { Except } from 'type-fest';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

// Utility to convert Observable to AsyncIterable
function observableToAsyncIterable<T>(
  observable: Observable<T>,
): AsyncIterable<T> {
  const iterator = {
    next: () =>
      new Promise<{ value: T; done: boolean }>((resolve, reject) => {
        const subscription = observable.subscribe({
          next(value) {
            resolve({ value, done: false });
            subscription.unsubscribe();
          },
          error(err) {
            reject(err);
          },
          complete() {
            resolve({ value: undefined as any, done: true });
          },
        });
      }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return iterator as AsyncIterable<T>;
}

interface RunBody {
  agentId: string;
  messages: any[];
  sessionId?: string;
}

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
  async runAgentOnce(
    @Body() body: RunBody,
    @Headers('x-initiator') initiator: string,
  ) {
    // collect only the final message; use lastValueFrom
    const { lastValueFrom } = await import('rxjs');
    return lastValueFrom(
      this.agent.runAgent({ ...body, initiator }).pipe(
        // The final emission from runAgent will contain the full data
        filter((chunk) => chunk.type === 'final'),
        map((chunk) => chunk.payload),
      ),
    );
  }

  @Post('run/stream') // <- POST instead of GET
  @Sse('run/stream') // keep the SSE decorator
  runAgentStream(
    @Body() body: RunBody,
    @Headers('x-initiator') initiator: string,
  ) {
    //set streaming to true
    return this.agent
      .runAgent({ ...body, stream: true, initiator })
      .pipe(map((data) => ({ data })));
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

  //get agent session full chat by sessionId
  @Get('sessions/:sessionId/chat')
  async getAgentSessionFullChat(
    @Param('agentId') agentId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const chat = await this.agent.getAgentChatSession(sessionId);
    if (!chat) {
      throw new BadRequestException('Unable to get chat');
    }
    return { data: chat };
  }

  // ──────────────── AGENT KNOWLEDGEBASE ────────────────
  @Get(':agentId/knowledgebase')
  async getAgentKnowledgebase(@Param('agentId') agentId: string) {
    const kb = await this.agent.getAgentKnowledgebase(agentId);
    return { data: kb };
  }
  @Put(':agentId/knowledgebase')
  async updateAgentKnowledgebase(
    @Param('agentId') agentId: string,
    @Body() body: { knowledgebase: any[] },
  ) {
    const kb = await this.agent.updateAgentKnowledgebase(
      agentId,
      body.knowledgebase,
    );
    return { data: kb };
  }

  // ──────────────── AGENT PREFERRED CONNECTIONS ────────────────
  @Get(':agentId/preferred-connections')
  async getPreferredConnections(@Param('agentId') agentId: string) {
    const connections = await this.agent.getPreferredConnections(agentId);
    return { data: connections };
  }
  @Post(':agentId/preferred-connections')
  async addPreferredConnection(
    @Param('agentId') agentId: string,
    @Body() body: { preferredAgentId: string; usageComments?: string },
  ) {
    const conn = await this.agent.addPreferredConnection(
      agentId,
      body.preferredAgentId,
      body.usageComments,
    );
    return { data: conn };
  }
  @Delete('preferred-connections/:id')
  async removePreferredConnection(@Param('id') id: string) {
    await this.agent.removePreferredConnection(id);
    return { success: true };
  }

  // ──────────────── AGENT TOOLS ────────────────
  @Get(':agentId/tools')
  async getAgentTools(@Param('agentId') agentId: string) {
    const tools = await this.agent.getAgentTools(agentId);
    // Do not expose secureKeyRef
    return { data: tools.map(({ secureKeyRef, ...rest }) => rest) };
  }
  @Post(':agentId/tools')
  async addAgentTool(
    @Param('agentId') agentId: string,
    @Body() body: { toolId: string; usageComments?: string },
  ) {
    const tool = await this.agent.addAgentTool(
      agentId,
      body.toolId,
      body.usageComments,
    );
    // Do not expose secureKeyRef
    const { secureKeyRef, ...rest } = tool;
    return { data: rest };
  }
  @Delete('tools/:id')
  async removeAgentTool(@Param('id') id: string) {
    await this.agent.removeAgentTool(id);
    return { success: true };
  }
}
