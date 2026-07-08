import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from './session.service';

@Controller({ version: '1', path: 'sessions' })
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  /**
   * Create a new session
   * POST /v1/sessions
   */
  @Post()
  async createSession(
    @Body() body: { agentId: string; initiator?: string; title?: string; source?: string },
    @Req() req: Request,
  ) {
    if (!body.agentId) throw new BadRequestException('agentId is required');
    const principal = (req as any).principal;
    const session = await this.sessionService.createSession({
      value: {
        agentId: body.agentId,
        initiator:
          principal?.principalType === 'user'
            ? principal.principalId
            : body.initiator,
        title: body.title,
        // Accept 'cli' | 'web' from the caller; default to 'web' if not provided
        initiatorType: body.source === 'cli' ? 'cli' : (body.source ?? 'web'),
      },
    });
    return { data: session };
  }

  @Get('agent/:agentId')
  async getSessionsByAgentId(@Param('agentId') agentId: string) {
    const sessions = await this.sessionService.getSessionsByAgentId(agentId);
    return { data: sessions };
  }

  @Get('user/:initiator')
  async getSessionsByInitiator(@Param('initiator') initiator: string) {
    const sessions = await this.sessionService.getSessionsByInitiator({ initiator });
    return { data: sessions };
  }

  @Get('list/:agentId/:initiator/')
  async getSessionsByAgentAndInitiator(
    @Param('agentId') agentId: string,
    @Param('initiator') initiator: string,
  ) {
    const sessions = await this.sessionService.getSessionsByAgentAndInitiator({
      agentId,
      initiator,
    });
    return { data: sessions };
  }

  @Get(':id/full')
  async getSessionWithGoalsAndTasks(@Param('id') id: string) {
    const session = await this.sessionService.getSessionWithGoalsAndTasks({
      id,
    });
    return { data: session };
  }

  @Get(':id')
  async getSessionWithContent(@Param('id') id: string) {
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
    @Body() body: { title?: string },
    @Req() req: Request,
  ) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new BadRequestException('title is required');
    }
    await this.assertOwnership(id, req);
    const session = await this.sessionService.renameSession({
      id,
      title: body.title.trim(),
    });
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

  /**
   * When the caller authenticates as a user (per-principal key), make sure the
   * session belongs to them. Management/agent principals are trusted callers
   * (e.g. the commons-app backend, which scopes to the signed-in user itself).
   */
  private async assertOwnership(id: string, req: Request) {
    const principal = (req as any).principal;
    if (principal?.principalType !== 'user') return;
    const session = await this.sessionService.getSessionWithContent({ id });
    if (!session) throw new NotFoundException(`Session with ID ${id} not found`);
    if (
      session.initiator &&
      session.initiator.toLowerCase() !== principal.principalId?.toLowerCase()
    ) {
      throw new ForbiddenException('You do not own this session');
    }
  }
}
