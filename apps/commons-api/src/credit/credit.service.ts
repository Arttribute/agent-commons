import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, isNull, lte, or, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import type { CreditBalance, CreditLedgerInput } from './credit.types';

type Tx = any;
const NEW_USER_CREDIT_GRANT = 500;

@Injectable()
export class CreditService {
  constructor(private readonly db: DatabaseService) {}

  async getBalance(input: {
    principalId: string;
    workspaceId?: string | null;
  }): Promise<CreditBalance & { reserved: number; available: number }> {
    const account = await this.db.transaction(async (tx) => {
      await this.lockPrincipal(tx, input.principalId);
      const row = await this.ensureAccount(tx, input.principalId);
      return this.expireReservations(tx, row);
    });
    return {
      principalId: input.principalId,
      workspaceId: input.workspaceId,
      balance: account.balance,
      reserved: account.reserved,
      available: account.balance - account.reserved,
      currency: 'credits',
    };
  }

  /** Credits are pooled by principal. workspaceId remains attribution metadata. */
  async listEntries(input: {
    principalId: string;
    workspaceId?: string | null;
    limit?: number;
  }) {
    return this.db.query.creditLedgerEntry.findMany({
      where: and(
        eq(schema.creditLedgerEntry.principalId, input.principalId),
        isNull(schema.creditLedgerEntry.voidedAt),
      ),
      orderBy: desc(schema.creditLedgerEntry.createdAt),
      limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
    });
  }

  async getSummary(principalId: string) {
    const [balance, recent, campaigns, transfers] = await Promise.all([
      this.getBalance({ principalId }),
      this.listEntries({ principalId, limit: 25 }),
      this.listCampaigns(principalId),
      this.listTransfers(principalId, 20),
    ]);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [month] = await this.db
      .select({
        earned: sql<number>`coalesce(sum(${schema.creditLedgerEntry.amount}) filter (where ${schema.creditLedgerEntry.amount} > 0), 0)`,
        spent: sql<number>`abs(coalesce(sum(${schema.creditLedgerEntry.amount}) filter (where ${schema.creditLedgerEntry.amount} < 0), 0))`,
      })
      .from(schema.creditLedgerEntry)
      .where(
        and(
          eq(schema.creditLedgerEntry.principalId, principalId),
          isNull(schema.creditLedgerEntry.voidedAt),
          gte(schema.creditLedgerEntry.createdAt, monthStart),
        ),
      );
    return {
      balance,
      month: {
        earned: Number(month?.earned ?? 0),
        spent: Number(month?.spent ?? 0),
      },
      recent,
      campaigns,
      transfers,
    };
  }

  async record(input: CreditLedgerInput) {
    const normalized = this.normalizeInput(input);
    return this.db.transaction((tx) => this.recordWithTx(tx, normalized));
  }

  async grant(input: Omit<CreditLedgerInput, 'direction'>) {
    return this.record({ ...input, direction: 'grant' });
  }

  async debit(input: Omit<CreditLedgerInput, 'direction'>) {
    return this.record({ ...input, direction: 'debit' });
  }

  /** Convert raw provider cost to credits with a configurable gross-margin multiplier. */
  creditsForUsd(costUsd: number) {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
    const units = Number(process.env.CREDIT_UNITS_PER_USD || 1000);
    const markup = Number(process.env.MODEL_COST_MARKUP || 2);
    if (
      !Number.isFinite(units) ||
      units <= 0 ||
      !Number.isFinite(markup) ||
      markup <= 0
    ) {
      throw new HttpException(
        {
          code: 'credit_price_configuration_error',
          message: 'Usage pricing is temporarily unavailable.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return Math.max(1, Math.ceil(costUsd * units * markup));
  }

  async reserve(input: {
    principalId: string;
    amount: number;
    purpose: string;
    idempotencyKey: string;
    agentId?: string;
    sessionId?: string;
    ttlSeconds?: number;
    maxActive?: number;
    metadata?: Record<string, unknown>;
  }) {
    this.positiveInteger(input.amount, 'amount');
    return this.db.transaction(async (tx) => {
      await this.lockPrincipal(tx, input.principalId);
      let account = await this.ensureAccount(tx, input.principalId);
      account = await this.expireReservations(tx, account);
      const existing = await tx.query.creditReservation.findFirst({
        where: eq(
          schema.creditReservation.idempotencyKey,
          input.idempotencyKey,
        ),
      });
      if (existing) return existing;
      if (input.maxActive) {
        const [active] = await tx
          .select({ value: sql<number>`count(*)` })
          .from(schema.creditReservation)
          .where(
            and(
              eq(schema.creditReservation.principalId, input.principalId),
              eq(schema.creditReservation.purpose, input.purpose),
              eq(schema.creditReservation.status, 'active'),
              gt(schema.creditReservation.expiresAt, new Date()),
            ),
          );
        if (Number(active?.value ?? 0) >= input.maxActive) {
          throw new HttpException(
            {
              code: 'concurrency_limit',
              message: `Your plan allows ${input.maxActive} concurrent agent run(s).`,
              limit: input.maxActive,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      this.assertAvailable(account, input.amount);
      const [reservation] = await tx
        .insert(schema.creditReservation)
        .values({
          principalId: input.principalId,
          amount: input.amount,
          purpose: input.purpose,
          idempotencyKey: input.idempotencyKey,
          agentId: input.agentId ?? null,
          sessionId: input.sessionId ?? null,
          metadata: input.metadata ?? {},
          expiresAt: new Date(Date.now() + (input.ttlSeconds ?? 3600) * 1000),
        })
        .returning();
      await tx
        .update(schema.creditAccount)
        .set({
          reserved: sql`${schema.creditAccount.reserved} + ${input.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.creditAccount.principalId, input.principalId));
      return reservation;
    });
  }

  async captureReservation(input: {
    reservationId: string;
    amount: number;
    idempotencyKey: string;
    eventType: string;
    sourcePlatform: CreditLedgerInput['sourcePlatform'];
    description?: string;
    agentId?: string;
    sessionId?: string;
    usageEventId?: string;
    metadata?: Record<string, unknown>;
  }) {
    this.positiveInteger(input.amount, 'amount');
    return this.db.transaction(async (tx) => {
      const reservation = await this.lockReservationPrincipal(
        tx,
        input.reservationId,
      );
      const existing = await tx.query.creditLedgerEntry.findFirst({
        where: eq(
          schema.creditLedgerEntry.idempotencyKey,
          input.idempotencyKey,
        ),
      });
      if (existing) return existing;
      if (
        reservation.status !== 'active' ||
        reservation.expiresAt <= new Date()
      ) {
        throw new HttpException(
          'Credit authorization has expired.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      let account = await this.ensureAccount(tx, reservation.principalId);
      account = await this.expireReservations(tx, account);
      const remaining = reservation.amount - reservation.capturedAmount;
      const extension = Math.max(0, input.amount - remaining);
      if (extension) {
        this.assertAvailable(account, extension);
        await tx
          .update(schema.creditReservation)
          .set({
            amount: sql`${schema.creditReservation.amount} + ${extension}`,
          })
          .where(
            eq(schema.creditReservation.reservationId, input.reservationId),
          );
        await tx
          .update(schema.creditAccount)
          .set({
            reserved: sql`${schema.creditAccount.reserved} + ${extension}`,
          })
          .where(eq(schema.creditAccount.principalId, reservation.principalId));
        account = { ...account, reserved: account.reserved + extension };
      }

      const entry = await this.insertLedgerAndApplyAccount(tx, {
        principalId: reservation.principalId,
        principalType: 'user',
        workspaceId: null,
        amount: -input.amount,
        direction: 'debit',
        eventType: input.eventType,
        sourcePlatform: input.sourcePlatform,
        idempotencyKey: input.idempotencyKey,
        description: input.description ?? null,
        relatedCourseId: null,
        relatedChallengeId: null,
        agentId: input.agentId ?? reservation.agentId,
        sessionId: input.sessionId ?? reservation.sessionId,
        taskId: null,
        workflowId: null,
        usageEventId: input.usageEventId ?? null,
        metadata: input.metadata ?? {},
        createdBy: 'usage_service',
        createdByType: 'service',
        expiresAt: undefined,
      });
      await tx
        .update(schema.creditAccount)
        .set({
          reserved: sql`${schema.creditAccount.reserved} - ${input.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.creditAccount.principalId, reservation.principalId));
      await tx
        .update(schema.creditReservation)
        .set({
          capturedAmount: sql`${schema.creditReservation.capturedAmount} + ${input.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.creditReservation.reservationId, input.reservationId));
      return entry;
    });
  }

  /** Ensure an active run still has enough pre-authorized credit for its next call. */
  async ensureReservationCapacity(
    reservationId: string,
    requiredRemaining: number,
  ) {
    this.positiveInteger(requiredRemaining, 'requiredRemaining');
    return this.db.transaction(async (tx) => {
      const reservation = await this.lockReservationPrincipal(
        tx,
        reservationId,
      );
      if (
        reservation.status !== 'active' ||
        reservation.expiresAt <= new Date()
      ) {
        throw new HttpException(
          'Credit authorization has expired.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      const remaining = reservation.amount - reservation.capturedAmount;
      const extension = Math.max(0, requiredRemaining - remaining);
      if (!extension) return reservation;
      let account = await this.ensureAccount(tx, reservation.principalId);
      account = await this.expireReservations(tx, account);
      this.assertAvailable(account, extension);
      const [updated] = await tx
        .update(schema.creditReservation)
        .set({
          amount: sql`${schema.creditReservation.amount} + ${extension}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.creditReservation.reservationId, reservationId))
        .returning();
      await tx
        .update(schema.creditAccount)
        .set({
          reserved: sql`${schema.creditAccount.reserved} + ${extension}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.creditAccount.principalId, reservation.principalId));
      return updated;
    });
  }

  async finalizeReservation(reservationId: string, minimumCapture = 0) {
    return this.db.transaction(async (tx) => {
      const reservation = await this.lockReservationPrincipal(
        tx,
        reservationId,
      );
      if (reservation.status !== 'active') return reservation;
      const reservedToRelease = reservation.amount - reservation.capturedAmount;
      const minimumDue = Math.max(
        0,
        minimumCapture - reservation.capturedAmount,
      );
      if (minimumDue > 0) {
        const due = Math.min(
          minimumDue,
          reservation.amount - reservation.capturedAmount,
        );
        await this.insertLedgerAndApplyAccount(tx, {
          principalId: reservation.principalId,
          principalType: 'user',
          workspaceId: null,
          amount: -due,
          direction: 'debit',
          eventType: 'agent_run_platform',
          sourcePlatform: 'agent_commons',
          idempotencyKey: `reservation-minimum:${reservationId}`,
          description: 'Agent run platform fee',
          relatedCourseId: null,
          relatedChallengeId: null,
          agentId: reservation.agentId,
          sessionId: reservation.sessionId,
          taskId: null,
          workflowId: null,
          usageEventId: null,
          metadata: { reservationId },
          createdBy: 'usage_service',
          createdByType: 'service',
          expiresAt: undefined,
        });
        reservation.capturedAmount += due;
      }
      await tx
        .update(schema.creditAccount)
        .set({
          reserved: sql`greatest(0, ${schema.creditAccount.reserved} - ${reservedToRelease})`,
          updatedAt: new Date(),
        })
        .where(eq(schema.creditAccount.principalId, reservation.principalId));
      const [updated] = await tx
        .update(schema.creditReservation)
        .set({
          capturedAmount: reservation.capturedAmount,
          status:
            reservation.capturedAmount >= reservation.amount
              ? 'captured'
              : 'released',
          updatedAt: new Date(),
        })
        .where(eq(schema.creditReservation.reservationId, reservationId))
        .returning();
      return updated;
    });
  }

  async gift(input: {
    senderPrincipalId: string;
    recipientPrincipalId: string;
    amount: number;
    idempotencyKey: string;
    message?: string;
  }) {
    const sender = input.senderPrincipalId.trim();
    const recipient = input.recipientPrincipalId.trim();
    this.positiveInteger(input.amount, 'amount');
    if (!sender || !recipient)
      throw new BadRequestException('Sender and recipient are required.');
    if (sender.toLowerCase() === recipient.toLowerCase()) {
      throw new BadRequestException('You cannot gift credits to yourself.');
    }
    if (input.amount < Number(process.env.CREDIT_GIFT_MIN || 10)) {
      throw new BadRequestException(
        `Minimum gift is ${process.env.CREDIT_GIFT_MIN || 10} credits.`,
      );
    }
    return this.db.transaction(async (tx) => {
      for (const id of [sender, recipient].sort())
        await this.lockPrincipal(tx, id);
      const existing = await tx.query.creditTransfer.findFirst({
        where: eq(schema.creditTransfer.idempotencyKey, input.idempotencyKey),
      });
      if (existing) return existing;
      let senderAccount = await this.ensureAccount(tx, sender);
      await this.ensureAccount(tx, recipient);
      senderAccount = await this.expireReservations(tx, senderAccount);
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const [sent] = await tx
        .select({
          total: sql<number>`coalesce(sum(${schema.creditTransfer.amount}), 0)`,
        })
        .from(schema.creditTransfer)
        .where(
          and(
            eq(schema.creditTransfer.senderPrincipalId, sender),
            eq(schema.creditTransfer.status, 'completed'),
            gte(schema.creditTransfer.createdAt, dayStart),
          ),
        );
      const dailyLimit = Number(process.env.CREDIT_GIFT_DAILY_LIMIT || 5000);
      if (Number(sent?.total ?? 0) + input.amount > dailyLimit) {
        throw new ForbiddenException(
          `Daily gifting limit is ${dailyLimit.toLocaleString()} credits.`,
        );
      }
      this.assertAvailable(senderAccount, input.amount);
      const [transfer] = await tx
        .insert(schema.creditTransfer)
        .values({
          senderPrincipalId: sender,
          recipientPrincipalId: recipient,
          amount: input.amount,
          message: input.message?.trim().slice(0, 240) || null,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();
      const transferExpiry = await this.expiryForNextSpend(
        tx,
        sender,
        input.amount,
      );
      await this.insertLedgerAndApplyAccount(tx, {
        ...this.baseTransferEntry(sender, input, transfer.transferId),
        amount: -input.amount,
        direction: 'debit',
        eventType: 'credit_gift_sent',
        idempotencyKey: `gift:${transfer.transferId}:sender`,
        description: input.message?.trim() || `Gift to ${recipient}`,
        metadata: { recipientPrincipalId: recipient },
      });
      await this.insertLedgerAndApplyAccount(tx, {
        ...this.baseTransferEntry(recipient, input, transfer.transferId),
        amount: input.amount,
        direction: 'grant',
        eventType: 'credit_gift_received',
        idempotencyKey: `gift:${transfer.transferId}:recipient`,
        description: input.message?.trim() || `Gift from ${sender}`,
        metadata: { senderPrincipalId: sender },
        // Preserve the shortest source-lot expiry so rewards cannot be turned
        // into longer-lived credits by gifting them through another account.
        expiresAt: transferExpiry,
      });
      return transfer;
    });
  }

  async expireGrant(entryId: string) {
    return this.db.transaction(async (tx) => {
      const preview = await tx.query.creditLedgerEntry.findFirst({
        where: eq(schema.creditLedgerEntry.entryId, entryId),
      });
      if (!preview) return null;
      // Match every spend path: principal advisory lock before ledger row lock.
      await this.lockPrincipal(tx, preview.principalId);
      const [grant] = await tx
        .select()
        .from(schema.creditLedgerEntry)
        .where(eq(schema.creditLedgerEntry.entryId, entryId))
        .for('update');
      if (
        !grant?.remainingAmount ||
        !grant.expiresAt ||
        grant.expiresAt > new Date()
      ) {
        return null;
      }
      const account = await this.ensureAccount(tx, grant.principalId);
      if (account.balance - account.reserved < grant.remainingAmount)
        return null;
      const idempotencyKey = `expire:${grant.entryId}`;
      const existing = await tx.query.creditLedgerEntry.findFirst({
        where: eq(schema.creditLedgerEntry.idempotencyKey, idempotencyKey),
      });
      if (existing) return existing;
      const entry = await this.insertLedgerAndApplyAccount(tx, {
        principalId: grant.principalId,
        principalType: grant.principalType,
        workspaceId: grant.workspaceId,
        amount: -grant.remainingAmount,
        direction: 'expiration',
        eventType: 'credit_expiration',
        sourcePlatform: 'system',
        idempotencyKey,
        description: 'Expired credits',
        relatedCourseId: grant.relatedCourseId,
        relatedChallengeId: grant.relatedChallengeId,
        agentId: null,
        sessionId: null,
        taskId: null,
        workflowId: null,
        usageEventId: null,
        metadata: { grantEntryId: grant.entryId },
        createdBy: 'sweeper',
        createdByType: 'service',
        expiresAt: undefined,
      });
      await tx
        .update(schema.creditLedgerEntry)
        .set({ remainingAmount: 0 })
        .where(eq(schema.creditLedgerEntry.entryId, grant.entryId));
      return entry;
    });
  }

  async listTransfers(principalId: string, limit = 20) {
    return this.db.query.creditTransfer.findMany({
      where: or(
        eq(schema.creditTransfer.senderPrincipalId, principalId),
        eq(schema.creditTransfer.recipientPrincipalId, principalId),
      ),
      orderBy: desc(schema.creditTransfer.createdAt),
      limit: Math.min(Math.max(limit, 1), 100),
    });
  }

  async listCampaigns(principalId: string) {
    const now = new Date();
    const campaigns = await this.db.query.creditCampaign.findMany({
      where: and(
        eq(schema.creditCampaign.active, true),
        eq(schema.creditCampaign.visible, true),
        or(
          isNull(schema.creditCampaign.startsAt),
          lte(schema.creditCampaign.startsAt, now),
        ),
        or(
          isNull(schema.creditCampaign.endsAt),
          gt(schema.creditCampaign.endsAt, now),
        ),
      ),
      orderBy: asc(schema.creditCampaign.createdAt),
    });
    return Promise.all(
      campaigns.map(async (campaign) => {
        const periodKey = this.periodKey(campaign.triggerType, undefined);
        const claimed = periodKey
          ? await this.db.query.creditRewardClaim.findFirst({
              where: and(
                eq(schema.creditRewardClaim.campaignKey, campaign.campaignKey),
                eq(schema.creditRewardClaim.principalId, principalId),
                eq(schema.creditRewardClaim.periodKey, periodKey),
              ),
            })
          : null;
        return {
          ...campaign,
          claimable:
            campaign.sourcePlatform === 'agent_commons' &&
            campaign.triggerType !== 'event' &&
            (campaign.metadata as any)?.selfClaim === true &&
            !claimed,
          claimed: !!claimed,
        };
      }),
    );
  }

  async upsertCampaign(input: {
    campaignKey: string;
    name: string;
    description?: string | null;
    rewardCredits: number;
    triggerType: 'once' | 'daily' | 'monthly' | 'event';
    sourcePlatform: CreditLedgerInput['sourcePlatform'];
    startsAt?: Date | null;
    endsAt?: Date | null;
    maxClaimsPerPrincipal?: number | null;
    monthlyCapPerPrincipal?: number | null;
    totalBudgetCredits?: number | null;
    visible?: boolean;
    active?: boolean;
    eligibility?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(input.campaignKey)) {
      throw new BadRequestException('campaignKey must be a lowercase slug.');
    }
    if (!input.name?.trim()) throw new BadRequestException('name is required.');
    this.positiveInteger(input.rewardCredits, 'rewardCredits');
    if (!['once', 'daily', 'monthly', 'event'].includes(input.triggerType)) {
      throw new BadRequestException('triggerType is invalid.');
    }
    if (
      !['agent_commons', 'commonlab', 'common_os', 'system'].includes(
        input.sourcePlatform,
      )
    ) {
      throw new BadRequestException('sourcePlatform is invalid.');
    }
    for (const [name, value] of [
      ['maxClaimsPerPrincipal', input.maxClaimsPerPrincipal],
      ['monthlyCapPerPrincipal', input.monthlyCapPerPrincipal],
      ['totalBudgetCredits', input.totalBudgetCredits],
    ] as const) {
      if (value != null) this.positiveInteger(value, name);
    }
    if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt.');
    }
    const values = {
      campaignKey: input.campaignKey,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      rewardCredits: input.rewardCredits,
      triggerType: input.triggerType,
      sourcePlatform: input.sourcePlatform,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      maxClaimsPerPrincipal: input.maxClaimsPerPrincipal ?? null,
      monthlyCapPerPrincipal: input.monthlyCapPerPrincipal ?? null,
      totalBudgetCredits: input.totalBudgetCredits ?? null,
      visible: input.visible ?? true,
      active: input.active ?? true,
      eligibility: input.eligibility ?? {},
      metadata: input.metadata ?? {},
      updatedAt: new Date(),
    };
    const [campaign] = await this.db
      .insert(schema.creditCampaign)
      .values(values)
      .onConflictDoUpdate({
        target: schema.creditCampaign.campaignKey,
        set: values,
      })
      .returning();
    return campaign;
  }

  async claimCampaign(input: {
    campaignKey: string;
    principalId: string;
    workspaceId?: string | null;
    eventId?: string;
    sourcePlatform: CreditLedgerInput['sourcePlatform'];
    relatedCourseId?: string;
    relatedChallengeId?: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
    selfService?: boolean;
  }) {
    return this.db.transaction(async (tx) => {
      await this.lockPrincipal(tx, input.principalId);
      await this.ensureAccount(tx, input.principalId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`campaign:${input.campaignKey}`}, 0))`,
      );
      const [campaign] = await tx
        .select()
        .from(schema.creditCampaign)
        .where(eq(schema.creditCampaign.campaignKey, input.campaignKey))
        .for('update');
      if (!campaign) throw new NotFoundException('Campaign not found.');
      if (
        input.selfService &&
        (campaign.sourcePlatform !== 'agent_commons' ||
          campaign.triggerType === 'event' ||
          (campaign.metadata as any)?.selfClaim !== true)
      ) {
        throw new ForbiddenException(
          'This reward must be verified by its source platform.',
        );
      }
      const now = new Date();
      if (
        !campaign.active ||
        (campaign.startsAt && campaign.startsAt > now) ||
        (campaign.endsAt && campaign.endsAt <= now)
      ) {
        throw new BadRequestException('This campaign is not active.');
      }
      if (
        campaign.sourcePlatform !== input.sourcePlatform &&
        input.sourcePlatform !== 'system'
      ) {
        throw new ForbiddenException(
          'Campaign source does not match the caller.',
        );
      }
      const periodKey = this.periodKey(campaign.triggerType, input.eventId);
      if (!periodKey)
        throw new BadRequestException('eventId is required for this campaign.');
      const existing = await tx.query.creditRewardClaim.findFirst({
        where: and(
          eq(schema.creditRewardClaim.campaignKey, campaign.campaignKey),
          eq(schema.creditRewardClaim.principalId, input.principalId),
          eq(schema.creditRewardClaim.periodKey, periodKey),
        ),
      });
      if (existing) return { claim: existing, alreadyClaimed: true };

      if (campaign.maxClaimsPerPrincipal) {
        const [count] = await tx
          .select({ value: sql<number>`count(*)` })
          .from(schema.creditRewardClaim)
          .where(
            and(
              eq(schema.creditRewardClaim.campaignKey, campaign.campaignKey),
              eq(schema.creditRewardClaim.principalId, input.principalId),
            ),
          );
        if (Number(count?.value ?? 0) >= campaign.maxClaimsPerPrincipal) {
          throw new BadRequestException('Campaign claim limit reached.');
        }
      }
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      if (campaign.monthlyCapPerPrincipal) {
        const [month] = await tx
          .select({
            value: sql<number>`coalesce(sum(${schema.creditRewardClaim.credits}), 0)`,
          })
          .from(schema.creditRewardClaim)
          .where(
            and(
              eq(schema.creditRewardClaim.campaignKey, campaign.campaignKey),
              eq(schema.creditRewardClaim.principalId, input.principalId),
              gte(schema.creditRewardClaim.claimedAt, monthStart),
            ),
          );
        if (
          Number(month?.value ?? 0) + campaign.rewardCredits >
          campaign.monthlyCapPerPrincipal
        ) {
          throw new BadRequestException(
            'Monthly campaign reward limit reached.',
          );
        }
      }
      if (
        campaign.totalBudgetCredits !== null &&
        Number(campaign.grantedCredits) + campaign.rewardCredits >
          Number(campaign.totalBudgetCredits)
      ) {
        throw new BadRequestException('Campaign budget has been exhausted.');
      }
      const expiryDays = Number((campaign.metadata as any)?.expiresInDays || 0);
      const entry = await this.recordWithTx(
        tx,
        this.normalizeInput({
          principalId: input.principalId,
          principalType: 'user',
          workspaceId: input.workspaceId,
          amount: campaign.rewardCredits,
          direction: 'grant',
          eventType: `campaign:${campaign.campaignKey}`,
          sourcePlatform: input.sourcePlatform,
          idempotencyKey: `campaign:${campaign.campaignKey}:${input.principalId}:${periodKey}`,
          description: campaign.name,
          relatedCourseId: input.relatedCourseId,
          relatedChallengeId: input.relatedChallengeId,
          agentId: input.agentId,
          metadata: input.metadata,
          createdBy: 'campaign_engine',
          createdByType: 'service',
          expiresAt: expiryDays
            ? new Date(now.getTime() + expiryDays * 86400_000)
            : undefined,
        }),
      );
      const [claim] = await tx
        .insert(schema.creditRewardClaim)
        .values({
          campaignKey: campaign.campaignKey,
          principalId: input.principalId,
          workspaceId: input.workspaceId ?? null,
          periodKey,
          eventId: input.eventId ?? null,
          credits: campaign.rewardCredits,
          ledgerEntryId: entry.entryId,
          sourcePlatform: input.sourcePlatform,
          metadata: input.metadata ?? {},
        })
        .returning();
      await tx
        .update(schema.creditCampaign)
        .set({
          grantedCredits: sql`${schema.creditCampaign.grantedCredits} + ${campaign.rewardCredits}`,
          updatedAt: now,
        })
        .where(eq(schema.creditCampaign.campaignKey, campaign.campaignKey));
      return { claim, entry, alreadyClaimed: false };
    });
  }

  private async recordWithTx(tx: Tx, normalized: any) {
    await this.lockPrincipal(tx, normalized.principalId);
    let account = await this.ensureAccount(tx, normalized.principalId);
    account = await this.expireReservations(tx, account);
    const existing = await tx.query.creditLedgerEntry.findFirst({
      where: eq(
        schema.creditLedgerEntry.idempotencyKey,
        normalized.idempotencyKey,
      ),
    });
    if (existing) return existing;
    if (normalized.amount < 0)
      this.assertAvailable(account, Math.abs(normalized.amount));
    return this.insertLedgerAndApplyAccount(tx, normalized);
  }

  private async insertLedgerAndApplyAccount(tx: Tx, normalized: any) {
    const [entry] = await tx
      .insert(schema.creditLedgerEntry)
      .values({
        ...normalized,
        remainingAmount: normalized.amount > 0 ? normalized.amount : null,
      })
      .returning();
    if (normalized.amount < 0)
      await this.consumeLots(
        tx,
        normalized.principalId,
        Math.abs(normalized.amount),
      );
    await tx
      .update(schema.creditAccount)
      .set({
        balance: sql`${schema.creditAccount.balance} + ${normalized.amount}`,
        lifetimeGranted:
          normalized.amount > 0
            ? sql`${schema.creditAccount.lifetimeGranted} + ${normalized.amount}`
            : schema.creditAccount.lifetimeGranted,
        lifetimeSpent:
          normalized.amount < 0
            ? sql`${schema.creditAccount.lifetimeSpent} + ${Math.abs(normalized.amount)}`
            : schema.creditAccount.lifetimeSpent,
        updatedAt: new Date(),
      })
      .where(eq(schema.creditAccount.principalId, normalized.principalId));
    return entry;
  }

  private async consumeLots(tx: Tx, principalId: string, amount: number) {
    let left = amount;
    const lots = await tx
      .select()
      .from(schema.creditLedgerEntry)
      .where(
        and(
          eq(schema.creditLedgerEntry.principalId, principalId),
          gt(schema.creditLedgerEntry.remainingAmount, 0),
          isNull(schema.creditLedgerEntry.voidedAt),
          or(
            isNull(schema.creditLedgerEntry.expiresAt),
            gt(schema.creditLedgerEntry.expiresAt, new Date()),
          ),
        ),
      )
      .orderBy(
        sql`${schema.creditLedgerEntry.expiresAt} asc nulls last`,
        asc(schema.creditLedgerEntry.createdAt),
      )
      .for('update');
    for (const lot of lots) {
      if (left <= 0) break;
      const consumed = Math.min(left, lot.remainingAmount ?? 0);
      if (!consumed) continue;
      await tx
        .update(schema.creditLedgerEntry)
        .set({ remainingAmount: (lot.remainingAmount ?? 0) - consumed })
        .where(eq(schema.creditLedgerEntry.entryId, lot.entryId));
      left -= consumed;
    }
  }

  private async expiryForNextSpend(
    tx: Tx,
    principalId: string,
    amount: number,
  ): Promise<Date | undefined> {
    let left = amount;
    let earliest: Date | undefined;
    const lots = await tx
      .select({
        remainingAmount: schema.creditLedgerEntry.remainingAmount,
        expiresAt: schema.creditLedgerEntry.expiresAt,
        createdAt: schema.creditLedgerEntry.createdAt,
      })
      .from(schema.creditLedgerEntry)
      .where(
        and(
          eq(schema.creditLedgerEntry.principalId, principalId),
          gt(schema.creditLedgerEntry.remainingAmount, 0),
          isNull(schema.creditLedgerEntry.voidedAt),
          or(
            isNull(schema.creditLedgerEntry.expiresAt),
            gt(schema.creditLedgerEntry.expiresAt, new Date()),
          ),
        ),
      )
      .orderBy(
        sql`${schema.creditLedgerEntry.expiresAt} asc nulls last`,
        asc(schema.creditLedgerEntry.createdAt),
      )
      .for('update');
    for (const lot of lots) {
      if (left <= 0) break;
      const used = Math.min(left, lot.remainingAmount ?? 0);
      if (!used) continue;
      if (lot.expiresAt && (!earliest || lot.expiresAt < earliest)) {
        earliest = lot.expiresAt;
      }
      left -= used;
    }
    return earliest;
  }

  private async ensureAccount(tx: Tx, principalId: string) {
    const [created] = await tx
      .insert(schema.creditAccount)
      .values({ principalId })
      .onConflictDoNothing({ target: schema.creditAccount.principalId })
      .returning({ principalId: schema.creditAccount.principalId });

    // Commons Identity user IDs are canonical `usr_*` principals. Award the
    // onboarding balance in the same transaction that creates their account,
    // so parallel first requests cannot duplicate it and no browser input is
    // trusted. Existing accounts are untouched.
    if (created && principalId.startsWith('usr_')) {
      await tx.insert(schema.creditLedgerEntry).values({
        principalId,
        principalType: 'user',
        amount: NEW_USER_CREDIT_GRANT,
        direction: 'grant',
        eventType: 'new_user_welcome',
        sourcePlatform: 'agent_commons',
        idempotencyKey: `new-user-welcome:${principalId}`,
        description: 'Welcome to Agent Commons',
        metadata: { automatic: true },
        createdBy: 'onboarding_service',
        createdByType: 'service',
        remainingAmount: NEW_USER_CREDIT_GRANT,
      });
      await tx
        .update(schema.creditAccount)
        .set({
          balance: NEW_USER_CREDIT_GRANT,
          lifetimeGranted: NEW_USER_CREDIT_GRANT,
          updatedAt: new Date(),
        })
        .where(eq(schema.creditAccount.principalId, principalId));
    }
    const [account] = await tx
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.principalId, principalId))
      .for('update');
    return account;
  }

  private async expireReservations(tx: Tx, account: any) {
    const expired = await tx
      .select()
      .from(schema.creditReservation)
      .where(
        and(
          eq(schema.creditReservation.principalId, account.principalId),
          eq(schema.creditReservation.status, 'active'),
          lte(schema.creditReservation.expiresAt, new Date()),
        ),
      )
      .for('update');
    const released = expired.reduce(
      (sum: number, item: any) => sum + item.amount - item.capturedAmount,
      0,
    );
    if (!released) return account;
    await tx
      .update(schema.creditReservation)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(schema.creditReservation.principalId, account.principalId),
          eq(schema.creditReservation.status, 'active'),
          lte(schema.creditReservation.expiresAt, new Date()),
        ),
      );
    await tx
      .update(schema.creditAccount)
      .set({
        reserved: sql`greatest(0, ${schema.creditAccount.reserved} - ${released})`,
      })
      .where(eq(schema.creditAccount.principalId, account.principalId));
    return { ...account, reserved: Math.max(0, account.reserved - released) };
  }

  private async reservationForUpdate(tx: Tx, reservationId: string) {
    const [reservation] = await tx
      .select()
      .from(schema.creditReservation)
      .where(eq(schema.creditReservation.reservationId, reservationId))
      .for('update');
    if (!reservation)
      throw new NotFoundException('Credit reservation not found.');
    return reservation;
  }

  /** Principal advisory locks always precede row locks to avoid cross-run deadlocks. */
  private async lockReservationPrincipal(tx: Tx, reservationId: string) {
    const preview = await tx.query.creditReservation.findFirst({
      where: eq(schema.creditReservation.reservationId, reservationId),
    });
    if (!preview) throw new NotFoundException('Credit reservation not found.');
    await this.lockPrincipal(tx, preview.principalId);
    return this.reservationForUpdate(tx, reservationId);
  }

  private assertAvailable(account: any, amount: number) {
    const available = Number(account.balance) - Number(account.reserved);
    if (available < amount) {
      throw new HttpException(
        {
          code: 'insufficient_credits',
          message: 'Insufficient credits.',
          balance: Number(account.balance),
          reserved: Number(account.reserved),
          available,
          required: amount,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private lockPrincipal(tx: Tx, principalId: string) {
    return tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`credits:${principalId.toLowerCase()}`}, 0))`,
    );
  }

  private normalizeInput(input: CreditLedgerInput) {
    const principalId = input.principalId?.trim();
    const eventType = input.eventType?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!principalId) throw new BadRequestException('principalId is required.');
    if (!eventType) throw new BadRequestException('eventType is required.');
    if (!idempotencyKey)
      throw new BadRequestException('idempotencyKey is required.');
    this.positiveInteger(input.amount, 'amount');
    const sign =
      input.direction === 'debit' || input.direction === 'expiration' ? -1 : 1;
    return {
      principalId,
      principalType: input.principalType ?? 'user',
      workspaceId: input.workspaceId ?? null,
      amount: input.amount * sign,
      direction: input.direction,
      eventType,
      sourcePlatform: input.sourcePlatform,
      idempotencyKey,
      description: input.description?.trim() || null,
      relatedCourseId: input.relatedCourseId ?? null,
      relatedChallengeId: input.relatedChallengeId ?? null,
      agentId: input.agentId ?? null,
      sessionId: input.sessionId ?? null,
      taskId: input.taskId ?? null,
      workflowId: input.workflowId ?? null,
      usageEventId: input.usageEventId ?? null,
      metadata: input.metadata ?? {},
      createdBy: input.createdBy ?? null,
      createdByType: input.createdByType ?? 'service',
      expiresAt: input.expiresAt,
    };
  }

  private positiveInteger(value: number, field: string) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${field} must be a positive integer.`);
    }
  }

  private periodKey(trigger: string, eventId?: string) {
    const now = new Date();
    if (trigger === 'once') return 'once';
    if (trigger === 'daily') return now.toISOString().slice(0, 10);
    if (trigger === 'monthly') return now.toISOString().slice(0, 7);
    if (trigger === 'event') return eventId?.trim().slice(0, 200) || null;
    return null;
  }

  private baseTransferEntry(
    principalId: string,
    input: any,
    transferId: string,
  ) {
    return {
      principalId,
      principalType: 'user',
      workspaceId: null,
      sourcePlatform: 'agent_commons',
      relatedCourseId: null,
      relatedChallengeId: null,
      agentId: null,
      sessionId: null,
      taskId: null,
      workflowId: null,
      usageEventId: null,
      createdBy: input.senderPrincipalId,
      createdByType: 'user',
      expiresAt: undefined,
      transferId,
    };
  }
}
