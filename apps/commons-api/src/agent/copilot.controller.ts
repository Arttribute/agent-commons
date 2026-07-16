import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { resolveCallerId } from '~/modules/auth';
import { CopilotAccessMode, CopilotService } from './copilot.service';
import { AgentService } from './agent.service';
import { omit } from 'lodash';

@Controller({ version: '1', path: 'copilot' })
export class CopilotController {
  constructor(
    private readonly copilot: CopilotService,
    private readonly agents: AgentService,
  ) {}

  @Get()
  async getCopilot(@Req() req: Request) {
    const ownerId = this.ownerId(req);
    return {
      data: omit(await this.agents.ensureDefaultCopilot(ownerId), [
        'wallet',
        'modelApiKey',
        'runtimeSecrets',
      ]),
    };
  }

  @Put('settings')
  async updateSettings(
    @Req() req: Request,
    @Body() body: { accessMode: CopilotAccessMode; scopes?: string[] },
  ) {
    return {
      data: omit(await this.copilot.updateSettings(this.ownerId(req), body), [
        'wallet',
        'modelApiKey',
        'runtimeSecrets',
      ]),
    };
  }

  @Get('changes')
  async listChanges(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
  ) {
    return {
      data: await this.copilot.listChanges(this.ownerId(req), {
        status,
        resourceType,
        resourceId,
      }),
    };
  }

  @Post('changes/:changeId/accept')
  async accept(@Req() req: Request, @Param('changeId') changeId: string) {
    return {
      data: await this.copilot.acceptChange(this.ownerId(req), changeId),
    };
  }

  @Post('changes/:changeId/reject')
  async reject(@Req() req: Request, @Param('changeId') changeId: string) {
    return {
      data: await this.copilot.rejectChange(this.ownerId(req), changeId),
    };
  }

  @Post('changes/:changeId/revert')
  async revert(@Req() req: Request, @Param('changeId') changeId: string) {
    return {
      data: await this.copilot.revertChange(this.ownerId(req), changeId),
    };
  }

  private ownerId(req: Request) {
    const ownerId = resolveCallerId(req);
    if (!ownerId) throw new BadRequestException('Owner identity is required');
    return ownerId;
  }
}
