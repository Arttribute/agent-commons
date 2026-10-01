import { Controller, Post, Put, Body, Get, Param, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { resolveCallerId, type ApiKeyPrincipal } from '~/modules/auth';
import { GoalService } from './goal.service';

type Status = 'pending' | 'started' | 'completed' | 'failed';

function caller(request: Request) {
  const principal = (request as any).principal as ApiKeyPrincipal | undefined;
  const ownerId = resolveCallerId(request);
  if (!ownerId || principal?.principalType === 'agent') {
    throw new UnauthorizedException('A signed-in user is required');
  }
  return ownerId;
}

@Controller({ version: '1', path: 'goals' })
export class GoalController {
  constructor(private readonly goals: GoalService) {}

  @Post()
  async create(@Req() request: Request, @Body() body: any) {
    return { data: await this.goals.create(body, caller(request)) };
  }

  @Put(':goalId')
  async updateProgress(
    @Param('goalId') goalId: string,
    @Body() body: { progress: number; status: Status },
    @Req() request: Request,
  ) {
    return {
      data: await this.goals.updateProgress(goalId, body.progress, body.status, caller(request)),
    };
  }

  @Get(':goalId')
  async get(@Req() request: Request, @Param('goalId') goalId: string) {
    return { data: await this.goals.get(goalId, caller(request)) };
  }
}
