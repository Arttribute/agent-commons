import { Controller, Get, Query, Req } from '@nestjs/common';
import { ActivityService } from './activity.service';

@Controller({ version: '1', path: 'activity/events' })
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('actorId') requestedActorId?: string,
    @Query('eventType') eventType?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const principal = req.principal as
      | {
          principalId: string;
          principalType: 'user' | 'agent' | 'service';
        }
      | undefined;
    const actorId =
      principal && principal.principalType !== 'service'
        ? principal.principalId
        : requestedActorId;
    if (!actorId) return { data: [] };
    const parsedSince = since ? new Date(since) : undefined;
    return {
      data: await this.activity.find({
        actorId,
        eventType,
        since:
          parsedSince && !Number.isNaN(parsedSince.getTime())
            ? parsedSince
            : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }
}
