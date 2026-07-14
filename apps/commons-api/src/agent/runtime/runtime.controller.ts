import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OwnerGuard, OwnerOnly, RateLimit } from '~/modules/auth';
import { RuntimeManagementService } from './runtime-management.service';
import type { AgentRuntimeType, RuntimeConfig } from './runtime.types';

@Controller({ version: '1', path: 'agents/:agentId/runtime' })
@UseGuards(OwnerGuard)
@OwnerOnly({ table: 'agent', idParam: 'agentId' })
export class RuntimeController {
  constructor(private readonly runtimes: RuntimeManagementService) {}

  @Get()
  async get(@Param('agentId') agentId: string) {
    return { data: await this.runtimes.get(agentId) };
  }

  @Put()
  async configure(
    @Param('agentId') agentId: string,
    @Body()
    body: {
      runtimeType?: AgentRuntimeType;
      version?: string | null;
      config?: RuntimeConfig;
      deploy?: boolean;
    },
    @Req() req: any,
  ) {
    return {
      data: await this.runtimes.configure(agentId, body, {
        id: req.principal?.principalId,
        type: req.principal?.principalType ?? 'user',
      }),
    };
  }

  @Post('deploy')
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'user' })
  async deploy(@Param('agentId') agentId: string, @Req() req: any) {
    await this.runtimes.deploy(agentId, {
      id: req.principal?.principalId,
      type: req.principal?.principalType ?? 'user',
    });
    return { data: await this.runtimes.get(agentId) };
  }

  @Post('sleep')
  async sleep(@Param('agentId') agentId: string, @Req() req: any) {
    return {
      data: await this.runtimes.sleep(agentId, req.principal?.principalId),
    };
  }

  @Post('restart')
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'user' })
  async restart(@Param('agentId') agentId: string, @Req() req: any) {
    return {
      data: await this.runtimes.restart(agentId, req.principal?.principalId),
    };
  }

  @Post('channels/:channel/:action')
  @RateLimit({ limit: 20, windowMs: 60_000, keyStrategy: 'user' })
  async channelAction(
    @Param('agentId') agentId: string,
    @Param('channel') channel: string,
    @Param('action') action: string,
  ) {
    return {
      data: await this.runtimes.channelAction(agentId, channel, action),
    };
  }
}
