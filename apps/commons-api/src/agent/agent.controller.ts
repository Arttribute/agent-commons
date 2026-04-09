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
  UseGuards,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { HeartbeatService } from './heartbeat.service';
import { TypedBody } from '@nestia/core';
import * as schema from '#/models/schema';
import { InferInsertModel } from 'drizzle-orm';
import { Except } from 'type-fest';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { omit } from 'lodash';
import { OwnerGuard, OwnerOnly } from '~/modules/auth';

interface RunBody {
  agentId: string;
  messages: any[];
  sessionId?: string;
}

@Controller({ version: '1', path: 'agents' })
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly heartbeat: HeartbeatService,
  ) {}

  @Post()
  async createAgent(
    @TypedBody()
    body: Except<
      InferInsertModel<typeof schema.agent>,
      'agentId' | 'createdAt'
    > & { commonsOwned?: boolean },
  ) {
    const agent = await this.agent.createAgent({
      value: body as InferInsertModel<typeof schema.agent>,
      commonsOwned: body.commonsOwned,
    });
    return { data: omit(agent, ['wallet', 'modelApiKey']) };
  }

  @Post('run')
  async runAgentOnce(
    @Body() body: RunBody & { initiator?: string; initiatorId?: string },
    @Headers('x-initiator') initiatorHeader: string,
  ) {
    const initiator = initiatorHeader || body.initiator || body.initiatorId || '';
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

  @Post('run/stream')
  @Sse('run/stream')
  runAgentStream(
    @Body() body: RunBody & { initiator?: string; initiatorId?: string },
    @Headers('x-initiator') initiatorHeader: string,
  ) {
    // Accept initiator from header (SDK / proxied web requests) or body (direct callers).
    const initiator = initiatorHeader || body.initiator || body.initiatorId || '';
    return this.agent
      .runAgent({ ...body, stream: true, initiator })
      .pipe(map((data) => ({ data })));
  }

  @Post(':agentId/trigger')
  async triggerAgent(@Param('agentId') agentId: string) {
    this.agent.triggerAgent({ agentId });
    return {
      message: 'Agent trigger sent. Make sure you have enabled agent autonomy for the trigger to work',
    };
  }

  // ──────────────── AUTONOMY / HEARTBEAT ────────────────

  /**
   * GET /v1/agents/:agentId/autonomy
   * Returns live heartbeat status for an agent.
   */
  @Get(':agentId/autonomy')
  async getAutonomy(@Param('agentId') agentId: string) {
    const status = await this.heartbeat.status(agentId);
    return { data: status };
  }

  /**
   * PUT /v1/agents/:agentId/autonomy
   * Enable or disable the heartbeat, and optionally update the interval.
   *
   * Body: { enabled: boolean, intervalSec?: number }
   */
  @Put(':agentId/autonomy')
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'agent', idParam: 'agentId' })
  async setAutonomy(
    @Param('agentId') agentId: string,
    @Body() body: { enabled: boolean; intervalSec?: number },
  ) {
    if (body.enabled) {
      await this.heartbeat.enable(agentId, body.intervalSec ?? 300);
    } else {
      await this.heartbeat.disable(agentId);
    }
    const status = await this.heartbeat.status(agentId);
    return { data: status };
  }

  /**
   * POST /v1/agents/:agentId/autonomy/trigger
   * Fire a single heartbeat beat immediately (for testing / manual wake-up).
   */
  @Post(':agentId/autonomy/trigger')
  async triggerHeartbeat(@Param('agentId') agentId: string) {
    await this.heartbeat.triggerNow(agentId);
    return { message: 'Heartbeat triggered' };
  }

  @Get(':agentId')
  async getAgent(@Param('agentId') agentId: string) {
    const agent = await this.agent.getAgent({ agentId });
    if (!agent) {
      throw new BadRequestException('Agent not found');
    }
    return { data: omit(agent, ['wallet', 'modelApiKey']) };
  }

  @Get()
  async getAgents(@Query('owner') owner?: string) {
    const agents = owner
      ? await this.agent.getAgentsByOwner(owner)
      : await this.agent.getAgents();
    return { data: agents.map((a) => omit(a, ['wallet', 'modelApiKey'])) };
  }

  /**
   * PUT /v1/agents/:agentId
   * Update an agent's data in the DB
   */
  @Put(':agentId')
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'agent' })
  async updateAgent(@Param('agentId') agentId: string, @Body() body: any) {
    const updated = await this.agent.updateAgent(agentId, body);
    if (!updated) {
      throw new BadRequestException('Unable to update agent');
    }
    return { data: omit(updated, ['wallet', 'modelApiKey']) };
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
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'agent' })
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
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'agent' })
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
    return { data: tools };
  }
  @Post(':agentId/tools')
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'agent' })
  async addAgentTool(
    @Param('agentId') agentId: string,
    @Body() body: { toolId: string; usageComments?: string },
  ) {
    const tool = await this.agent.addAgentTool(
      agentId,
      body.toolId,
      body.usageComments,
    );
    return { data: tool };
  }
  @Delete('tools/:id')
  async removeAgentTool(@Param('id') id: string) {
    await this.agent.removeAgentTool(id);
    return { success: true };
  }

  // ──────────────── TTS VOICES ────────────────
  /**
   * GET /v1/agents/voices?provider=openai|elevenlabs&q=search
   * Returns a list of voices from the selected TTS provider.
   */
  @Get('tts/voices')
  async listVoices(
    @Query('provider') provider: 'openai' | 'elevenlabs' = 'openai',
    @Query('q') q?: string,
  ) {
    const data = await this.agent.getTtsVoices({ provider, q });
    return { data };
  }
}
