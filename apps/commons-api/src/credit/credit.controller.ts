import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { RateLimit, resolveCallerId } from '~/modules/auth';
import { CreditService } from './credit.service';
import type { CreditPlatform, CreditPrincipalType } from './credit.types';

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

type RewardClaimBody = {
  campaignKey?: string;
  principalId?: string;
  workspaceId?: string | null;
  eventId?: string;
  sourcePlatform?: CreditPlatform;
  relatedCourseId?: string;
  relatedChallengeId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
};

type CampaignWriteBody = {
  campaignKey?: string;
  name?: string;
  description?: string;
  rewardCredits?: number;
  triggerType?: 'once' | 'daily' | 'monthly' | 'event';
  sourcePlatform?: CreditPlatform;
  startsAt?: string | null;
  endsAt?: string | null;
  maxClaimsPerPrincipal?: number | null;
  monthlyCapPerPrincipal?: number | null;
  totalBudgetCredits?: number | null;
  visible?: boolean;
  active?: boolean;
  eligibility?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

@Controller('credits')
export class CreditController {
  constructor(private readonly credits: CreditService) {}

  @Get('balance')
  @Version('1')
  @RateLimit({ limit: 60, windowMs: 60_000, keyStrategy: 'user' })
  async balance(
    @Req() req: any,
    @Query('principalId') requestedPrincipalId?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const principal = this.principalForRequest(req);
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
  @RateLimit({ limit: 60, windowMs: 60_000, keyStrategy: 'user' })
  async ledger(
    @Req() req: any,
    @Query('principalId') requestedPrincipalId?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    const principal = this.principalForRequest(req);
    const principalId = this.readPrincipalId(principal, requestedPrincipalId);
    return {
      data: await this.credits.listEntries({
        principalId,
        workspaceId: workspaceId ?? principal?.workspaceId ?? undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Get('summary')
  @Version('1')
  @RateLimit({ limit: 60, windowMs: 60_000, keyStrategy: 'user' })
  async summary(@Req() req: any) {
    const principal = this.requirePrincipal(req);
    return { data: await this.credits.getSummary(principal.principalId) };
  }

  @Get('campaigns')
  @Version('1')
  @RateLimit({ limit: 60, windowMs: 60_000, keyStrategy: 'user' })
  async campaigns(@Req() req: any) {
    const principal = this.requirePrincipal(req);
    return { data: await this.credits.listCampaigns(principal.principalId) };
  }

  @Post('campaigns')
  @Version('1')
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'user' })
  async upsertCampaign(@Req() req: any, @Body() body: CampaignWriteBody) {
    const principal = this.requirePrincipal(req);
    if (!principal.scopes?.includes('platform:admin')) {
      throw new ForbiddenException('platform:admin scope is required.');
    }
    if (!body.campaignKey || !body.name || !body.triggerType) {
      throw new BadRequestException(
        'campaignKey, name, and triggerType are required.',
      );
    }
    return {
      data: await this.credits.upsertCampaign({
        campaignKey: body.campaignKey,
        name: body.name,
        description: body.description,
        rewardCredits: body.rewardCredits ?? 0,
        triggerType: body.triggerType,
        sourcePlatform: body.sourcePlatform ?? 'system',
        startsAt: this.readDate(body.startsAt, 'startsAt'),
        endsAt: this.readDate(body.endsAt, 'endsAt'),
        maxClaimsPerPrincipal: body.maxClaimsPerPrincipal,
        monthlyCapPerPrincipal: body.monthlyCapPerPrincipal,
        totalBudgetCredits: body.totalBudgetCredits,
        visible: body.visible,
        active: body.active,
        eligibility: body.eligibility,
        metadata: body.metadata,
      }),
    };
  }

  @Post('campaigns/claim')
  @Version('1')
  @RateLimit({ limit: 10, windowMs: 60_000, keyStrategy: 'user' })
  async claimCampaign(@Req() req: any, @Body() body: RewardClaimBody) {
    const principal = this.requirePrincipal(req);
    if (!body.campaignKey) {
      throw new BadRequestException('campaignKey is required.');
    }
    const serviceCaller = this.canWrite(principal);
    const principalId =
      serviceCaller && body.principalId
        ? body.principalId
        : principal.principalId;
    return {
      data: await this.credits.claimCampaign({
        campaignKey: body.campaignKey,
        principalId,
        workspaceId: body.workspaceId ?? principal.workspaceId,
        eventId: body.eventId,
        sourcePlatform: serviceCaller
          ? (body.sourcePlatform ?? 'system')
          : 'agent_commons',
        relatedCourseId: body.relatedCourseId,
        relatedChallengeId: body.relatedChallengeId,
        agentId: body.agentId,
        metadata: body.metadata,
        selfService: !serviceCaller,
      }),
    };
  }

  @Get('transfers')
  @Version('1')
  @RateLimit({ limit: 60, windowMs: 60_000, keyStrategy: 'user' })
  async transfers(@Req() req: any) {
    const principal = this.requirePrincipal(req);
    return { data: await this.credits.listTransfers(principal.principalId) };
  }

  @Post('gifts')
  @Version('1')
  @RateLimit({ limit: 5, windowMs: 60_000, keyStrategy: 'user' })
  async gift(
    @Req() req: any,
    @Body()
    body: {
      recipientPrincipalId?: string;
      amount?: number;
      message?: string;
      idempotencyKey?: string;
    },
  ) {
    const principal = this.requirePrincipal(req);
    const idempotencyKey = body.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required.');
    }
    return {
      data: await this.credits.gift({
        senderPrincipalId: principal.principalId,
        recipientPrincipalId: body.recipientPrincipalId ?? '',
        amount: body.amount ?? 0,
        message: body.message,
        idempotencyKey,
      }),
    };
  }

  @Post('grants')
  @Version('1')
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
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
  @RateLimit({ limit: 30, windowMs: 60_000, keyStrategy: 'user' })
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
      principal.scopes?.includes('credits:read') ||
      principal.scopes?.includes('credits:write') ||
      principal.scopes?.includes('platform:admin')
    ) {
      return requestedPrincipalId || principal.principalId;
    }
    if (
      requestedPrincipalId &&
      requestedPrincipalId.toLowerCase() !== principal.principalId.toLowerCase()
    ) {
      throw new ForbiddenException(
        'Cannot read another principal credit ledger.',
      );
    }
    return principal.principalId;
  }

  private assertCanWrite(principal: Principal | undefined) {
    if (!principal) throw new ForbiddenException('Authentication required.');
    if (this.canWrite(principal)) return;
    throw new ForbiddenException('credits:write scope is required.');
  }

  private canWrite(principal: Principal) {
    return Boolean(
      principal.scopes?.includes('credits:write') ||
        principal.scopes?.includes('platform:admin'),
    );
  }

  private readDate(value: string | null | undefined, field: string) {
    if (value === null || value === undefined) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be an ISO date.`);
    }
    return parsed;
  }

  private requirePrincipal(req: any): Principal {
    const principal = this.principalForRequest(req);
    if (!principal?.principalId)
      throw new ForbiddenException('Authentication required.');
    return principal;
  }

  /** Treat scoped proxy delegation as the signed-in user for self-service APIs. */
  private principalForRequest(req: any): Principal | undefined {
    const principal = req.principal as Principal | undefined;
    if (!principal) return undefined;
    const effectiveId = resolveCallerId(req) ?? principal.principalId;
    const delegated =
      principal.principalType === 'service' &&
      effectiveId.toLowerCase() !== principal.principalId.toLowerCase();
    return delegated
      ? {
          ...principal,
          principalId: effectiveId,
          principalType: 'user',
          scopes: [],
        }
      : principal;
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
