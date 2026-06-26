import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { CreditService } from './credit.service';
import type {
  CreditPlatform,
  CreditPrincipalType,
} from './credit.types';

type Principal = {
  principalId: string;
  principalType: CreditPrincipalType;
  workspaceId?: string | null;
  scopes?: string[];
};

type CreditWriteBody = {
  principalId?: string;
  principalType?: CreditPrincipalType;
  workspaceId?: string | null;
  amount?: number;
  eventType?: string;
  sourcePlatform?: CreditPlatform;
  idempotencyKey?: string;
  description?: string;
  relatedCourseId?: string;
  relatedChallengeId?: string;
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  workflowId?: string;
  usageEventId?: string;
  metadata?: Record<string, unknown>;
};

@Controller('credits')
export class CreditController {
  constructor(private readonly credits: CreditService) {}

  @Get('balance')
  @Version('1')
  async balance(
    @Req() req: any,
    @Query('principalId') requestedPrincipalId?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const principal = req.principal as Principal | undefined;
    const principalId = this.readPrincipalId(principal, requestedPrincipalId);
    return {
      data: await this.credits.getBalance({
        principalId,
        workspaceId: workspaceId ?? principal?.workspaceId ?? undefined,
      }),
    };
  }

  @Get('ledger')
  @Version('1')
  async ledger(
    @Req() req: any,
    @Query('principalId') requestedPrincipalId?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    const principal = req.principal as Principal | undefined;
    const principalId = this.readPrincipalId(principal, requestedPrincipalId);
    return {
      data: await this.credits.listEntries({
        principalId,
        workspaceId: workspaceId ?? principal?.workspaceId ?? undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Post('grants')
  @Version('1')
  async grant(@Req() req: any, @Body() body: CreditWriteBody) {
    const principal = req.principal as Principal | undefined;
    this.assertCanWrite(principal);
    const data = await this.credits.grant({
      ...this.bodyToInput(body),
      createdBy: principal?.principalId ?? 'management_key',
      createdByType: principal?.principalType ?? 'service',
    });
    return { data };
  }

  @Post('debits')
  @Version('1')
  async debit(@Req() req: any, @Body() body: CreditWriteBody) {
    const principal = req.principal as Principal | undefined;
    this.assertCanWrite(principal);
    const data = await this.credits.debit({
      ...this.bodyToInput(body),
      createdBy: principal?.principalId ?? 'management_key',
      createdByType: principal?.principalType ?? 'service',
    });
    return { data };
  }

  private readPrincipalId(
    principal: Principal | undefined,
    requestedPrincipalId?: string,
  ) {
    if (!principal) {
      if (!requestedPrincipalId) {
        throw new ForbiddenException('principalId is required.');
      }
      return requestedPrincipalId;
    }
    if (
      principal.principalType === 'service' ||
      principal.scopes?.includes('credits:read')
    ) {
      return requestedPrincipalId || principal.principalId;
    }
    if (
      requestedPrincipalId &&
      requestedPrincipalId.toLowerCase() !== principal.principalId.toLowerCase()
    ) {
      throw new ForbiddenException('Cannot read another principal credit ledger.');
    }
    return principal.principalId;
  }

  private assertCanWrite(principal: Principal | undefined) {
    if (!principal) return;
    if (
      principal.principalType === 'service' ||
      principal.scopes?.includes('credits:write')
    ) {
      return;
    }
    throw new ForbiddenException('credits:write scope is required.');
  }

  private bodyToInput(body: CreditWriteBody) {
    return {
      principalId: body.principalId || '',
      principalType: body.principalType ?? 'user',
      workspaceId: body.workspaceId,
      amount: body.amount ?? 0,
      eventType: body.eventType || '',
      sourcePlatform: body.sourcePlatform ?? 'system',
      idempotencyKey: body.idempotencyKey || '',
      description: body.description,
      relatedCourseId: body.relatedCourseId,
      relatedChallengeId: body.relatedChallengeId,
      agentId: body.agentId,
      sessionId: body.sessionId,
      taskId: body.taskId,
      workflowId: body.workflowId,
      usageEventId: body.usageEventId,
      metadata: body.metadata,
    };
  }
}
