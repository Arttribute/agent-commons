import { Controller, Param, Post, Body } from '@nestjs/common';
import { AutonomyService } from './autonomy.service';

@Controller({ version: '1', path: 'agents/:agentId/autonomy' })
export class AutonomyController {
  constructor(private readonly autonomy: AutonomyService) {}

  @Post('enable')
  async enable(
    @Param('agentId') agentId: string,
    @Body('intervalSec') intervalSec: number,
  ) {
    await this.autonomy.enable(agentId, intervalSec);
    return { message: `Autonomous mode enabled every ${intervalSec}s` };
  }

  @Post('pause')
  async pause(@Param('agentId') agentId: string) {
    await this.autonomy.pause(agentId);
    return { message: 'Autonomous mode paused' };
  }

  @Post('resume')
  async resume(@Param('agentId') agentId: string) {
    await this.autonomy.resume(agentId);
    return { message: 'Autonomous mode resumed' };
  }

  @Post('stop')
  async stop(@Param('agentId') agentId: string) {
    await this.autonomy.stop(agentId);
    return { message: 'Autonomous mode stopped' };
  }
}
