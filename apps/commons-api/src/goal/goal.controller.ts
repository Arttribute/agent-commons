import { Controller, Post, Put, Body, Get, Param } from '@nestjs/common';
import { GoalService } from './goal.service';

type Status = 'pending' | 'started' | 'completed' | 'failed';

@Controller({ version: '1', path: 'goals' })
export class GoalController {
  constructor(private readonly goals: GoalService) {}

  @Post()
  async create(@Body() body: any) {
    return { data: await this.goals.create(body) };
  }

  @Put(':goalId')
  async updateProgress(
    @Param('goalId') goalId: string,
    @Body() body: { progress: number; status: Status },
  ) {
    return {
      data: await this.goals.updateProgress(goalId, body.progress, body.status),
    };
  }

  @Get(':goalId')
  async get(@Param('goalId') goalId: string) {
    return { data: await this.goals.get(goalId) };
  }
}
