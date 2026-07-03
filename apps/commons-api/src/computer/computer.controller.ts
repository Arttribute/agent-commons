import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { OwnerGuard, OwnerOnly, RateLimit } from '~/modules/auth';
import { ComputerService } from './computer.service';

@Controller({ version: '1', path: 'agents/:agentId' })
@UseGuards(OwnerGuard)
@OwnerOnly({ table: 'agent', idParam: 'agentId' })
export class ComputerController {
  constructor(private readonly computers: ComputerService) {}

  @Get('computer/config')
  async getConfig(@Param('agentId') agentId: string) {
    const data = await this.computers.getConfig(agentId);
    return { data };
  }

  @Put('computer/config')
  async updateConfig(
    @Param('agentId') agentId: string,
    @Body() body: Record<string, any>,
  ) {
    const data = await this.computers.updateConfig(agentId, body as any);
    return { data };
  }

  @Get('computers')
  async listComputers(
    @Param('agentId') agentId: string,
    @Query('sessionId') sessionId?: string,
    @Query('includeTerminated') includeTerminated?: string,
  ) {
    const data = await this.computers.listInstances({
      agentId,
      sessionId,
      includeTerminated: includeTerminated === 'true',
    });
    return { data };
  }

  @Post('computers')
  @RateLimit({ limit: 20, windowMs: 60_000, keyStrategy: 'user' })
  async startComputer(
    @Param('agentId') agentId: string,
    @Body()
    body: {
      sessionId?: string;
      lifecycle?: 'persistent' | 'ephemeral';
      name?: string;
      reason?: string;
    },
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.startComputer({
      agentId,
      sessionId: body.sessionId,
      lifecycle: body.lifecycle,
      name: body.name,
      reason: body.reason,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return { data };
  }

  @Get('computers/:computerId')
  async getComputer(
    @Param('agentId') agentId: string,
    @Param('computerId') computerId: string,
  ) {
    const data = await this.computers.getInstance(agentId, computerId);
    return { data };
  }

  @Post('computers/:computerId/refresh')
  async refreshComputer(@Param('computerId') computerId: string) {
    const data = await this.computers.refreshInstance(computerId);
    return { data };
  }

  @Post('computers/:computerId/stop')
  async stopComputer(
    @Param('agentId') agentId: string,
    @Param('computerId') computerId: string,
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.stopComputer({
      agentId,
      computerId,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return { data };
  }

  @Get('computers/:computerId/files/read')
  async readFile(
    @Param('agentId') agentId: string,
    @Param('computerId') computerId: string,
    @Query('path') path: string,
  ) {
    const data = await this.computers.readFile({ agentId, computerId, path });
    return { data };
  }

  @Post('computers/:computerId/commands')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
  async runCommand(
    @Param('agentId') agentId: string,
    @Param('computerId') computerId: string,
    @Body()
    body: {
      command: string;
      cwd?: string;
      sessionId?: string;
      timeoutSeconds?: number;
    },
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.runCommand({
      agentId,
      computerId,
      command: body.command,
      cwd: body.cwd,
      sessionId: body.sessionId,
      timeoutSeconds: body.timeoutSeconds,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return { data };
  }

  @Post('computers/:computerId/browser/open')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
  async openBrowser(
    @Param('agentId') agentId: string,
    @Param('computerId') computerId: string,
    @Body() body: { url: string; sessionId?: string },
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.openBrowser({
      agentId,
      computerId,
      sessionId: body.sessionId,
      url: body.url,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return { data };
  }

  @Get('computers/:computerId/events')
  async getEvents(
    @Param('agentId') agentId: string,
    @Param('computerId') computerId: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.computers.getEvents({
      agentId,
      computerId,
      limit: limit ? Number(limit) : undefined,
    });
    return { data };
  }
}
