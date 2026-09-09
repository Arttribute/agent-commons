import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import {
  validateSpendingPolicy,
  positiveUnits,
  type SpendingPolicy,
} from './policy';
export interface PaymentSession {
  id: string;
  agent_id: string;
  wallet_id: string;
  runtime_session_id: string;
  policy: SpendingPolicy;
  expires_at: Date;
  revoked_at: Date | null;
  budget_units: string;
  reserved_units: string;
}
@Injectable()
export class PaymentSessionService {
  constructor(private readonly db: DatabaseService) {}
  async create(
    agentId: string,
    walletId: string,
    runtimeSessionId: string,
    policy: SpendingPolicy,
    budgetUnits: string,
    expiresAt: string,
  ) {
    const checked = validateSpendingPolicy(policy),
      budget = positiveUnits(budgetUnits),
      expires = new Date(expiresAt);
    if (
      !runtimeSessionId ||
      runtimeSessionId.length > 200 ||
      !Number.isFinite(expires.getTime()) ||
      expires.getTime() <= Date.now() ||
      expires.getTime() > Date.now() + 86400000 ||
      positiveUnits(checked.maxPaymentUnits) > budget
    )
      throw new BadRequestException(
        'Invalid session expiry, budget, or runtime session',
      );
    const result = await this.db
      .execute(sql`INSERT INTO wallet_payment_session(agent_id,wallet_id,runtime_session_id,policy,budget_units,expires_at)
   SELECT ${agentId},id,${runtimeSessionId},${JSON.stringify(checked)}::jsonb,${budget.toString()}::numeric,${expires.toISOString()}::timestamptz FROM agent_wallet WHERE id=${walletId}::uuid AND agent_id=${agentId} AND is_active=true AND wallet_type='eoa' AND encrypted_private_key IS NOT NULL RETURNING *`);
    if (!result[0])
      throw new BadRequestException(
        'An active signing EOA belonging to this agent is required',
      );
    return result[0];
  }
  async load(
    agentId: string,
    id: string,
    runtimeSessionId: string,
  ): Promise<PaymentSession> {
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new BadRequestException('Invalid payment session ID');
    const rows = await this.db.execute(
      sql`SELECT * FROM wallet_payment_session WHERE id=${id}::uuid AND agent_id=${agentId} AND runtime_session_id=${runtimeSessionId} AND revoked_at IS NULL AND expires_at>now()`,
    );
    if (!rows[0])
      throw new ForbiddenException(
        'Payment session missing, revoked, expired, or belongs to another runtime',
      );
    return rows[0] as unknown as PaymentSession;
  }
  /** Lock + reservation + unique request in ONE database transaction across all replicas. */
  async reserve(
    session: PaymentSession,
    key: string,
    amount: string,
    resource: string,
  ): Promise<string> {
    positiveUnits(amount);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
      throw new BadRequestException('Supply a stable idempotency key');
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute(
        sql`SELECT * FROM wallet_payment_session WHERE id=${session.id}::uuid FOR UPDATE`,
      );
      const current = rows[0] as unknown as PaymentSession;
      if (
        !current ||
        current.revoked_at ||
        new Date(current.expires_at).getTime() <= Date.now()
      )
        throw new ForbiddenException('Payment session expired or revoked');
      const previous = await tx.execute(
        sql`SELECT id FROM wallet_payment_attempt WHERE payment_session_id=${session.id}::uuid AND idempotency_key=${key}`,
      );
      if (previous.length)
        throw new ConflictException(
          'Payment already attempted; inspect its receipt instead of paying again',
        );
      if (
        BigInt(amount) > positiveUnits(current.policy.maxPaymentUnits) ||
        new URL(resource).origin !== current.policy.origin
      )
        throw new ForbiddenException('Payment outside grant');
      if (
        BigInt(current.reserved_units) + BigInt(amount) >
        BigInt(current.budget_units)
      )
        throw new ForbiddenException('Session budget exhausted');
      const attempts = await tx.execute(
        sql`INSERT INTO wallet_payment_attempt(payment_session_id,idempotency_key,amount_units,resource) VALUES(${session.id}::uuid,${key},${amount}::numeric,${resource}) RETURNING id`,
      );
      await tx.execute(
        sql`UPDATE wallet_payment_session SET reserved_units=reserved_units+${amount}::numeric WHERE id=${session.id}::uuid`,
      );
      return attempts[0].id as string;
    });
  }
  async finish(
    attemptId: string,
    state: 'settled' | 'unknown',
    settlement: unknown,
  ) {
    await this.db.execute(
      sql`UPDATE wallet_payment_attempt SET state=${state},settlement=${JSON.stringify(settlement)}::jsonb WHERE id=${attemptId}::uuid`,
    );
  }
  async list(agentId: string) {
    return this.db.execute(
      sql`SELECT * FROM wallet_payment_session WHERE agent_id=${agentId} ORDER BY created_at DESC LIMIT 100`,
    );
  }
  async attempts(agentId: string, id: string) {
    return this.db.execute(
      sql`SELECT a.* FROM wallet_payment_attempt a JOIN wallet_payment_session s ON s.id=a.payment_session_id WHERE s.id=${id}::uuid AND s.agent_id=${agentId} ORDER BY a.created_at DESC LIMIT 100`,
    );
  }
  async revoke(agentId: string, id: string) {
    await this.db.execute(
      sql`UPDATE wallet_payment_session SET revoked_at=now() WHERE id=${id}::uuid AND agent_id=${agentId}`,
    );
    return { revoked: true };
  }
}
