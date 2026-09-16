import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { OwnerGuard, OwnerOnly, RateLimit } from '~/modules/auth';
import { ArcadeService } from './arcade.service';
import type { ArcadeGameWrite } from './arcade.types';

/**
 * Common Arcade projects built by an agent, addressed through that agent.
 *
 * These are the same operations the agent's `arcade_*` tools perform, exposed
 * for the SDK and CLI. Routing through the agent keeps one authorization rule:
 * the caller must own the agent, and Arcade attributes the work to that owner.
 */
@Controller({ version: '1', path: 'agents/:agentId/arcade' })
@UseGuards(OwnerGuard)
@OwnerOnly({ table: 'agent', idParam: 'agentId' })
export class ArcadeController {
  constructor(private readonly arcade: ArcadeService) {}

  @Get('status')
  status() {
    return { data: { connected: this.arcade.isConnected() } };
  }

  @Get('projects')
  async list(@Param('agentId') agentId: string) {
    const actor = await this.arcade.actorForAgent(agentId);
    return { data: await this.arcade.listProjects(actor) };
  }

  @Post('projects')
  @RateLimit({ limit: 20, windowMs: 60_000, keyStrategy: 'user' })
  async create(
    @Param('agentId') agentId: string,
    @Body() body: { title: string; description?: string },
  ) {
    const actor = await this.arcade.actorForAgent(agentId);
    return { data: await this.arcade.createProject(actor, body) };
  }

  @Get('projects/:projectId')
  async get(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
  ) {
    const actor = await this.arcade.actorForAgent(agentId);
    return { data: await this.arcade.readProject(actor, projectId) };
  }

  @Put('projects/:projectId/game')
  @RateLimit({ limit: 60, windowMs: 60_000, keyStrategy: 'user' })
  async write(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
    @Body() body: ArcadeGameWrite,
  ) {
    const actor = await this.arcade.actorForAgent(agentId);
    return { data: await this.arcade.writeGame(actor, projectId, body) };
  }

  @Post('projects/:projectId/test')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
  async test(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
    @Body() body: { seed?: string; steps?: number } = {},
  ) {
    const actor = await this.arcade.actorForAgent(agentId);
    return { data: await this.arcade.testGame(actor, projectId, body) };
  }

  @Post('projects/:projectId/publish')
  @RateLimit({ limit: 15, windowMs: 60_000, keyStrategy: 'user' })
  async publish(
    @Param('agentId') agentId: string,
    @Param('projectId') projectId: string,
  ) {
    const actor = await this.arcade.actorForAgent(agentId);
    return { data: await this.arcade.publishGame(actor, projectId) };
  }
}
