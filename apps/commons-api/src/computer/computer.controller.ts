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
    return { data: this.computers.toPublicConfig(data) };
  }

  @Put('computer/config')
  async updateConfig(
    @Param('agentId') agentId: string,
    @Body() body: Record<string, any>,
  ) {
    const data = await this.computers.updateConfig(agentId, body as any);
    return { data: this.computers.toPublicConfig(data) };
  }

  /** Return the agent's one durable computer, including sleeping state. */
  @Get('computer')
  async getAssignedComputer(@Param('agentId') agentId: string) {
    const config = await this.computers.getConfig(agentId);
    const [computer] = await this.computers.listInstances({
      agentId,
      includeTerminated: true,
    });
    return {
      data: this.computers.toPublicComputer(computer ?? null, config),
    };
  }

  @Post('computer/wake')
  @RateLimit({ limit: 20, windowMs: 60_000, keyStrategy: 'user' })
  async wakeAssignedComputer(
    @Param('agentId') agentId: string,
    @Body() body: { reason?: string; sessionId?: string } = {},
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.startComputer({
      agentId,
      sessionId: body.sessionId,
      reason: body.reason ?? 'Computer wake requested',
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return {
      data: this.computers.toPublicComputer(
        data,
        await this.computers.getConfig(agentId),
      ),
    };
  }

  @Post('computer/sleep')
  async sleepAssignedComputer(
    @Param('agentId') agentId: string,
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.stopAssignedComputer({
      agentId,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return {
      data: this.computers.toPublicComputer(
        data,
        await this.computers.getConfig(agentId),
      ),
    };
  }

  @Post('computer/restart')
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'user' })
  async restartAssignedComputer(
    @Param('agentId') agentId: string,
    @Body() body: { reason?: string } = {},
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.restartAssignedComputer({
      agentId,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
      reason: body.reason,
    });
    return {
      data: this.computers.toPublicComputer(
        data,
        await this.computers.getConfig(agentId),
      ),
    };
  }

  @Post('computer/resize')
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'user' })
  async resizeAssignedComputer(
    @Param('agentId') agentId: string,
    @Body() body: Record<string, any>,
  ) {
    const config = await this.computers.updateConfig(agentId, body as any);
    const computer = await this.computers.getAssignedComputer(agentId);
    return {
      data: this.computers.toPublicComputer(computer, config),
    };
  }

  @Get('computer/files/read')
  async readAssignedComputerFile(
    @Param('agentId') agentId: string,
    @Query('path') path: string,
  ) {
    const data = await this.computers.readFile({ agentId, path });
    return { data };
  }

  @Post('computer/files/write')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
  async writeAssignedComputerFiles(
    @Param('agentId') agentId: string,
    @Body() body: { files: Array<{ path: string; content: string }> },
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.writeFiles({
      agentId,
      files: body.files,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return { data };
  }

  @Post('computer/commands')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
  async runAssignedComputerCommand(
    @Param('agentId') agentId: string,
    @Body()
    body: { command: string; cwd?: string; timeoutSeconds?: number },
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.runCommand({
      agentId,
      command: body.command,
      cwd: body.cwd,
      timeoutSeconds: body.timeoutSeconds,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return { data };
  }

  @Post('computer/exec')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
  async execAssignedComputerCommand(
    @Param('agentId') agentId: string,
    @Body()
    body: { command: string; cwd?: string; timeoutSeconds?: number },
    @Req() req: Request,
  ) {
    return this.runAssignedComputerCommand(agentId, body, req);
  }

  @Post('computer/browser/open')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
  async openAssignedComputerBrowser(
    @Param('agentId') agentId: string,
    @Body() body: { url: string },
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.openBrowser({
      agentId,
      url: body.url,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return { data };
  }

  @Post('computer/browser/test')
  @RateLimit({ limit: 20, windowMs: 60_000, keyStrategy: 'user' })
  async testAssignedComputerBrowser(
    @Param('agentId') agentId: string,
    @Body()
    body: {
      url?: string;
      actions?: Array<{
        type: 'click' | 'type' | 'select' | 'press' | 'expectText';
        selector?: string;
        text?: string;
        value?: string;
        key?: string;
      }>;
    },
    @Req() req: Request,
  ) {
    const principal = (req as any).principal;
    const data = await this.computers.testBrowser({
      agentId,
      ...body,
      actorId: principal?.principalId ?? (req.headers['x-initiator'] as string),
      actorType: principal?.principalType ?? 'user',
    });
    return { data };
  }

  @Get('computer/events')
  async getAssignedComputerEvents(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string,
  ) {
    const computer = await this.computers.getAssignedComputer(agentId);
    if (!computer) return { data: [] };
    const data = await this.computers.getEvents({
      agentId,
      computerId: computer.computerId,
      limit: limit ? Number(limit) : undefined,
    });
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
      /** @deprecated Ignored; the assigned computer is always persistent. */
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
  async refreshComputer(
    @Param('agentId') agentId: string,
    @Param('computerId') computerId: string,
  ) {
    const data = await this.computers.refreshForAgent(agentId, computerId);
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
