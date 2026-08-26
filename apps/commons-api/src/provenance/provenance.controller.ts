import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ProvenanceService } from './provenance.service';

@Controller({ version: '1', path: 'provenance' })
export class ProvenanceController {
  constructor(private readonly provenance: ProvenanceService) {}

  @Get('sessions/:sessionId')
  async sessionTrajectory(
    @Param('sessionId') sessionId: string,
    @Req() request: Request,
  ) {
    await this.assertSessionAccess(sessionId, request);
    return { data: await this.provenance.getSessionTrajectory(sessionId) };
  }

  @Get('traces/:traceId/bundle')
  async bundle(@Param('traceId') traceId: string, @Req() request: Request) {
    const run = await this.provenance.getRun(traceId);
    if (!run) throw new NotFoundException('Provenance trace not found');
    if (run.sessionId) await this.assertSessionAccess(run.sessionId, request);
    return { data: await this.provenance.buildBundle(traceId) };
  }

  @Post('traces/:traceId/anchor')
  async anchor(@Param('traceId') traceId: string, @Req() request: Request) {
    const run = await this.provenance.getRun(traceId);
    if (!run) throw new NotFoundException('Provenance trace not found');
    if (run.sessionId) await this.assertSessionAccess(run.sessionId, request);
    return { data: await this.provenance.requestAnchor(traceId) };
  }

  private async assertSessionAccess(sessionId: string, request: Request) {
    const trajectory = await this.provenance.getSessionTrajectory(sessionId);
    const principal = (request as any).principal;
    if (principal?.principalType !== 'user') return;
    const owner = trajectory.runs[0]?.initiator;
    if (
      owner &&
      owner.toLowerCase() !== String(principal.principalId ?? '').toLowerCase()
    ) {
      throw new ForbiddenException('You do not own this provenance session');
    }
  }
}
