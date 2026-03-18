import { Controller, Get, Param, Query, Version } from '@nestjs/common';
import { UsageService } from './usage.service';

@Controller('usage')
export class UsageController {
  constructor(private usageService: UsageService) {}

  /** GET /v1/agents/:agentId/usage[?from=ISO&to=ISO] */
  @Get('agents/:agentId')
  @Version('1')
  async getAgentUsage(
    @Param('agentId') agentId: string,
    @Query('from') from?: string,
    @Query('to')   to?:   string,
  ) {
    const data = await this.usageService.getAgentUsage(agentId, {
      from: from ? new Date(from) : undefined,
      to:   to   ? new Date(to)   : undefined,
    });
    return { data };
  }

  /** GET /v1/sessions/:sessionId/usage */
  @Get('sessions/:sessionId')
  @Version('1')
  async getSessionUsage(@Param('sessionId') sessionId: string) {
    const data = await this.usageService.getSessionUsage(sessionId);
    return { data };
  }
}
