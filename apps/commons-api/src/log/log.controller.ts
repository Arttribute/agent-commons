import { Controller, Get, Param, Query } from '@nestjs/common';
import { LogService } from './log.service';

@Controller({ version: '1', path: 'logs' })
export class LogController {
  constructor(private readonly logService: LogService) {}

  /** GET /v1/logs/agents/:agentId?limit=<n>&sessionId=<id> */
  @Get('agents/:agentId')
  async getAgentLogs(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    const logs = await this.logService.getAllAgentLogs({ agentId });
    let result = logs;
    if (sessionId) result = result.filter((l) => l.sessionId === sessionId);
    if (limit) result = result.slice(0, parseInt(limit, 10));
    return { data: result };
  }
}
