import { Controller, Get, Param } from '@nestjs/common';
import { SessionService } from './session.service';

@Controller({ version: '1', path: 'sessions' })
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

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
}
