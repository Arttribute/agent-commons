import { BadRequestException, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { CreditService } from './credit.service';

export const REFERRAL_REWARD = 1000;
export const REFERRAL_CODE = /^[A-Za-z0-9_-]{22}$/;

export function referralEmail(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new BadRequestException('Enter a valid email address.');
  }
  return email;
}

// Treat Gmail aliases as one verified identity, including account recreation.
export function referralEmailHash(value: string): string {
  const [local, domain] = referralEmail(value).split('@');
  const canonical = domain === 'gmail.com' || domain === 'googlemail.com'
    ? `${local.split('+')[0].replace(/\./g, '')}@gmail.com`
    : `${local}@${domain}`;
  return createHash('sha256').update(canonical).digest('hex');
}

export type ReferralActivation = {
  principalId: string;
  email: string;
  emailVerified: boolean;
  firstActivation: boolean;
  activatedAt: string;
  code?: string;
};

@Injectable()
export class ReferralService {
  constructor(private readonly db: DatabaseService, private readonly credits: CreditService) {}

  private async profile(principalId: string) {
    await this.db.insert(schema.referralProfile).values({
      principalId, code: randomBytes(16).toString('base64url'),
    }).onConflictDoNothing({ target: schema.referralProfile.principalId });
    return (await this.db.select().from(schema.referralProfile)
      .where(eq(schema.referralProfile.principalId, principalId)))[0];
  }

  async summary(principalId: string, verifiedEmail?: string) {
    const profile = await this.profile(principalId);
    if (verifiedEmail) await this.db.update(schema.referralProfile).set({ emailHash: referralEmailHash(verifiedEmail) })
      .where(eq(schema.referralProfile.principalId, principalId));
    const [totals] = await this.db.select({ count: sql<number>`count(*)`, earned: sql<number>`coalesce(sum(reward_credits), 0)` })
      .from(schema.referralSignup).where(eq(schema.referralSignup.referrerPrincipalId, principalId));
    const [signups, invitations] = await Promise.all([
      this.db.select({ joinedAt: schema.referralSignup.joinedAt, credits: schema.referralSignup.rewardCredits })
        .from(schema.referralSignup).where(eq(schema.referralSignup.referrerPrincipalId, principalId))
        .orderBy(desc(schema.referralSignup.joinedAt)).limit(50),
      this.db.select({ email: schema.referralInvitation.email, status: schema.referralInvitation.status, createdAt: schema.referralInvitation.createdAt })
        .from(schema.referralInvitation).where(eq(schema.referralInvitation.principalId, principalId))
        .orderBy(desc(schema.referralInvitation.createdAt)).limit(50),
    ]);
    return { code: profile.code, rewardCredits: REFERRAL_REWARD, joined: Number(totals.count), earned: Number(totals.earned), signups, invitations };
  }

  /** Input comes exclusively from the app's authenticated activation callback. */
  async activate(input: ReferralActivation) {
    if (!/^usr_[A-Za-z0-9_-]+$/.test(input.principalId)) throw new BadRequestException('Invalid user identity.');
    if (input.emailVerified !== true) return { rewarded: false };
    const emailHash = referralEmailHash(input.email);
    await this.profile(input.principalId);
    await this.db.update(schema.referralProfile).set({ emailHash }).where(eq(schema.referralProfile.principalId, input.principalId));
    if (input.firstActivation !== true || !REFERRAL_CODE.test(input.code ?? '')) {
      return { rewarded: false };
    }
    const activatedAt = new Date(input.activatedAt);
    if (!Number.isFinite(activatedAt.getTime()) || activatedAt.getTime() > Date.now() + 300_000) throw new BadRequestException('Invalid activation time.');
    return this.db.transaction(async (tx) => {
      // Serialize both identity and email before credit locks. Global ordering
      // makes concurrent retries and separate accounts using an alias safe.
      for (const key of [`referral:email:${emailHash}`, `referral:user:${input.principalId}`].sort()) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      }
      const existing = await tx.select().from(schema.referralSignup).where(or(
        eq(schema.referralSignup.referredPrincipalId, input.principalId),
        eq(schema.referralSignup.emailHash, emailHash),
      ));
      if (existing.length) return { rewarded: false, alreadyRecorded: true };
      const [referrer] = await tx.select().from(schema.referralProfile).where(eq(schema.referralProfile.code, input.code!));
      if (!referrer?.emailHash || referrer.principalId === input.principalId || referrer.emailHash === emailHash) return { rewarded: false };
      // Accounts that have already used this product cannot be retroactively
      // attributed. The app attests first activation before provisioning credits.
      const [account] = await tx.select({ createdAt: schema.creditAccount.createdAt })
        .from(schema.creditAccount).where(eq(schema.creditAccount.principalId, input.principalId));
      if (account && account.createdAt < activatedAt) return { rewarded: false };
      const ledger = await this.credits.grantReferralWithTx(tx, referrer.principalId, input.principalId);
      await tx.insert(schema.referralSignup).values({
        referredPrincipalId: input.principalId, emailHash,
        referrerPrincipalId: referrer.principalId, ledgerEntryId: ledger.entryId,
      });
      return { rewarded: true, credits: REFERRAL_REWARD };
    });
  }

  async reserveInvitation(principalId: string, recipient: unknown) {
    const email = referralEmail(recipient);
    const profile = await this.profile(principalId);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`referral-invites:${principalId}`}, 0))`);
      const [existing] = await tx.select().from(schema.referralInvitation).where(and(
        eq(schema.referralInvitation.principalId, principalId), eq(schema.referralInvitation.email, email),
      ));
      if (existing?.status === 'sent') return { ...existing, code: profile.code, alreadySent: true };
      if (existing?.status === 'pending' && Date.now() - existing.createdAt.getTime() >= 23 * 3600_000) {
        // Resend keeps idempotency keys for 24h. An ambiguous old send must
        // never be retried with a new key and accidentally email twice.
        throw new HttpException('This invitation is awaiting delivery confirmation. Invite your friend using your link.', HttpStatus.SERVICE_UNAVAILABLE);
      }
      if (existing && Date.now() - existing.createdAt.getTime() < 23 * 3600_000) {
        return { ...existing, code: profile.code, alreadySent: false };
      }
      const [daily] = await tx.select({ count: sql<number>`count(*)` }).from(schema.referralInvitation).where(and(
        eq(schema.referralInvitation.principalId, principalId),
        gte(schema.referralInvitation.createdAt, new Date(Date.now() - 86400_000)),
      ));
      if (Number(daily.count) >= 10) throw new HttpException('You can send 10 invitations per day. Try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
      if (existing) await tx.delete(schema.referralInvitation).where(eq(schema.referralInvitation.invitationId, existing.invitationId));
      const [invitation] = await tx.insert(schema.referralInvitation).values({ principalId, email }).returning();
      return { ...invitation, code: profile.code, alreadySent: false };
    });
  }

  async completeInvitation(principalId: string, invitationId: string, sent: boolean) {
    if (!/^[0-9a-f-]{36}$/i.test(invitationId)) throw new BadRequestException('Invalid invitation.');
    await this.db.update(schema.referralInvitation).set({ status: sent ? 'sent' : 'failed', sentAt: sent ? new Date() : null })
      .where(and(eq(schema.referralInvitation.principalId, principalId), eq(schema.referralInvitation.invitationId, invitationId),
        or(eq(schema.referralInvitation.status, 'pending'), eq(schema.referralInvitation.status, 'failed'))));
    return { sent };
  }
}
