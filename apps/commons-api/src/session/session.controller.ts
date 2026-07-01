import { Controller, Get, Post, Body, Param, BadRequestException, Req } from '@nestjs/common';
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
}
