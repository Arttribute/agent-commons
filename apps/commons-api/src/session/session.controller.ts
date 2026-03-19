import { Controller, Get, Post, Body, Param, BadRequestException } from '@nestjs/common';
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
    @Body() body: { agentId: string; initiator?: string; title?: string },
  ) {
    if (!body.agentId) throw new BadRequestException('agentId is required');
    const session = await this.sessionService.createSession({
      value: {
        agentId: body.agentId,
        initiator: body.initiator,
        title: body.title,
      },
    });
    return { data: session };
  }

  @Get('agent/:agentId')
  async getSessionsByAgentId(@Param('agentId') agentId: string) {
    const sessions = await this.sessionService.getSessionsByAgentId(agentId);
    return { data: sessions };
  }

  @Get(':id')
  async getSessionWithContent(@Param('id') id: string) {
    const session = await this.sessionService.getSessionWithContent({ id });
    return { data: session };
  }

  @Get(':id/full')
  async getSessionWithGoalsAndTasks(@Param('id') id: string) {
    const session = await this.sessionService.getSessionWithGoalsAndTasks({
      id,
    });
    return { data: session };
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
}
