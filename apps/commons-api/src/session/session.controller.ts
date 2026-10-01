import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from './session.service';
import { ProjectService } from '~/project/project.service';
import { resolveCallerId } from '~/modules/auth';

@Controller({ version: '1', path: 'sessions' })
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly projects: ProjectService,
  ) {}

  /**
   * Create a new session
   * POST /v1/sessions
   */
  @Post()
  async createSession(
    @Body()
    body: {
      agentId: string;
      initiator?: string;
      title?: string;
      source?: string;
      projectId?: string;
    },
    @Req() req: Request,
  ) {
    if (!body.agentId) throw new BadRequestException('agentId is required');
    const principal = (req as any).principal;
    const scopedCaller = this.scopedCaller(req);
    if (scopedCaller.agentId && scopedCaller.agentId !== body.agentId) {
      throw new NotFoundException('Agent not found');
    }
    const initiator =
      scopedCaller.userId ??
      (principal?.principalType === 'agent'
        ? principal.principalId
        : body.initiator);
    // A chat can only join a project its initiator owns.
    const projectId = body.projectId
      ? (await this.projects.requireProject(initiator ?? '', body.projectId))
          .projectId
      : undefined;
    const session = await this.sessionService.createSession({
      value: {
        agentId: body.agentId,
        initiator,
        title: body.title,
        projectId,
        // Accept 'cli' | 'web' from the caller; default to 'web' if not provided
        initiatorType: body.source === 'cli' ? 'cli' : body.source ?? 'web',
      },
    });
    return { data: session };
  }

  @Get('agent/:agentId')
  async getSessionsByAgentId(
    @Param('agentId') agentId: string,
    @Req() req: Request,
  ) {
    const scopedCaller = this.scopedCaller(req);
    if (scopedCaller.agentId && scopedCaller.agentId !== agentId) {
      throw new NotFoundException('Agent not found');
    }
    const sessions = await this.sessionService.getSessionsByAgentId(agentId);
    return {
      data: scopedCaller.userId
        ? sessions.filter(
            (session) =>
              session.initiator?.toLowerCase() ===
              scopedCaller.userId?.toLowerCase(),
          )
        : sessions,
    };
  }

  @Get('user/:initiator')
  async getSessionsByInitiator(
    @Param('initiator') initiator: string,
    @Req() req: Request,
  ) {
    this.assertInitiatorAccess(initiator, req);
    const sessions = await this.sessionService.getSessionsByInitiator({
      initiator,
    });
    return { data: sessions };
  }

  @Get('list/:agentId/:initiator/')
  async getSessionsByAgentAndInitiator(
    @Param('agentId') agentId: string,
    @Param('initiator') initiator: string,
    @Req() req: Request,
  ) {
    this.assertInitiatorAccess(initiator, req);
    const scopedCaller = this.scopedCaller(req);
    if (scopedCaller.agentId && scopedCaller.agentId !== agentId) {
      throw new NotFoundException('Agent not found');
    }
    const sessions = await this.sessionService.getSessionsByAgentAndInitiator({
      agentId,
      initiator,
    });
    return { data: sessions };
  }

  @Get(':id/full')
  async getSessionWithGoalsAndTasks(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    await this.assertOwnership(id, req);
    const session = await this.sessionService.getSessionWithGoalsAndTasks({
      id,
    });
    return { data: session };
  }

  @Get(':id')
  async getSessionWithContent(@Param('id') id: string, @Req() req: Request) {
    await this.assertOwnership(id, req);
    const session = await this.sessionService.getSessionWithContent({ id });
    return { data: session };
  }

  /**
   * Rename a session
   * PATCH /v1/sessions/:id  { title }
   */
  @Patch(':id')
  async renameSession(
    @Param('id') id: string,
    @Body()
    body: { title?: string; projectId?: string | null; initiator?: string },
    @Req() req: Request,
  ) {
    const movesProject = body.projectId !== undefined;
    if (
      !movesProject &&
      (typeof body.title !== 'string' || !body.title.trim())
    ) {
      throw new BadRequestException('title is required');
    }
    await this.assertOwnership(id, req);
    if (movesProject) {
      const owner = this.scopedCaller(req).userId ?? body.initiator;
      if (!owner) throw new BadRequestException('A signed-in user is required');
      await this.projects.assignSession(owner, id, body.projectId || null);
    }
    const session =
      typeof body.title === 'string' && body.title.trim()
        ? await this.sessionService.renameSession({
            id,
            title: body.title.trim(),
          })
        : await this.sessionService.getSessionWithContent({ id });
    return { data: session };
  }

  /**
   * Delete a session
   * DELETE /v1/sessions/:id
   */
  @Delete(':id')
  async deleteSession(@Param('id') id: string, @Req() req: Request) {
    await this.assertOwnership(id, req);
    const result = await this.sessionService.deleteSession({ id });
    return { data: result };
  }

  private scopedCaller(req: Request): { userId?: string; agentId?: string } {
    const principal = (req as any).principal;
    if (principal?.principalType === 'user')
      return { userId: principal.principalId };
    if (principal?.principalType === 'agent')
      return { agentId: principal.principalId };
    if (
      principal?.principalType === 'service' &&
      (req.headers['x-owner-id'] || req.headers['x-initiator'])
    ) {
      return { userId: resolveCallerId(req) };
    }
    return {};
  }

  private assertInitiatorAccess(initiator: string, req: Request) {
    const scopedCaller = this.scopedCaller(req);
    const callerId = scopedCaller.userId ?? scopedCaller.agentId;
    if (callerId && callerId.toLowerCase() !== initiator.toLowerCase()) {
      throw new NotFoundException('Sessions not found');
    }
  }

  private async assertOwnership(id: string, req: Request) {
    const scopedCaller = this.scopedCaller(req);
    if (!scopedCaller.userId && !scopedCaller.agentId) return;
    const session = await this.sessionService.getSessionWithContent({ id });
    if (
      scopedCaller.userId &&
      session.initiator?.toLowerCase() !== scopedCaller.userId.toLowerCase()
    )
      throw new NotFoundException('Session not found');
    if (scopedCaller.agentId && session.agentId !== scopedCaller.agentId)
      throw new NotFoundException('Session not found');
  }
}
