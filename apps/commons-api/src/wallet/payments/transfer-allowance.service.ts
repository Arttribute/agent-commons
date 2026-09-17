import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { parseUnits } from 'viem';
import { DatabaseService } from '~/modules/database/database.service';

/**
 * Networks where an agent may send USDC on its own. Autonomous mainnet
 * payments stay disabled by policy, and Hedera needs token association.
 */
export const AUTONOMOUS_TRANSFER_CHAINS = ['84532', '5042002', '11142220'];

/** Longest allowance an owner can set; scheduled work needs more than a day. */
const MAX_ALLOWANCE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RECIPIENTS = 50;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const USDC_AMOUNT = /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/;

export interface TransferAllowance {
  id: string;
  agent_id: string;
  wallet_id: string;
  chain_id: string;
  recipients: string[];
  max_transfer_units: string;
  budget_units: string;
  spent_units: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_by: string;
  created_at: Date;
}

export interface WalletTransferRecord {
  id: string;
  allowance_id: string;
  agent_id: string;
  idempotency_key: string;
  chain_id: string;
  to_address: string;
  amount_units: string;
  state: 'reserved' | 'confirmed' | 'failed' | 'unknown';
  tx_hash: string | null;
  error: string | null;
  session_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTransferAllowanceDto {
  walletId: string;
  chainId: string;
  /** Total USDC the agent may send, e.g. "25" */
  budget: string;
  /** Largest single transfer in USDC, e.g. "5" */
  maxPerTransfer: string;
  /** Allowed recipient addresses. Omit or leave empty for any recipient. */
  recipients?: string[];
  expiresAt: string;
}

/** Parse a human USDC amount into 6-decimal atomic units. */
export function usdcUnits(value: unknown, label = 'Amount'): bigint {
  if (typeof value !== 'string' || !USDC_AMOUNT.test(value.trim()))
    throw new BadRequestException(
      `${label} must be a positive USDC amount with at most 6 decimals`,
    );
  const units = parseUnits(value.trim(), 6);
  if (units <= 0n)
    throw new BadRequestException(`${label} must be greater than zero`);
  return units;
}

@Injectable()
export class TransferAllowanceService {
  constructor(private readonly db: DatabaseService) {}

  async create(
    agentId: string,
    createdBy: string,
    dto: CreateTransferAllowanceDto,
  ): Promise<TransferAllowance> {
    if (!AUTONOMOUS_TRANSFER_CHAINS.includes(dto?.chainId))
      throw new BadRequestException(
        'Agent transfers are limited to Base Sepolia, Arc Testnet and Celo Sepolia',
      );
    const budget = usdcUnits(dto.budget, 'Budget');
    const maxPerTransfer = usdcUnits(dto.maxPerTransfer, 'Max per transfer');
    if (maxPerTransfer > budget)
      throw new BadRequestException(
        'Max per transfer cannot exceed the total budget',
      );
    const expires = new Date(dto.expiresAt);
    if (
      !Number.isFinite(expires.getTime()) ||
      expires.getTime() <= Date.now() ||
      expires.getTime() > Date.now() + MAX_ALLOWANCE_MS
    )
      throw new BadRequestException(
        'Expiry must be in the future and within 30 days',
      );
    const recipients = [
      ...new Set((dto.recipients ?? []).map((r) => String(r).trim())),
    ].filter(Boolean);
    if (
      recipients.length > MAX_RECIPIENTS ||
      recipients.some((r) => !ADDRESS.test(r))
    )
      throw new BadRequestException(
        `Recipients must be up to ${MAX_RECIPIENTS} 0x addresses`,
      );

    const rows = await this.db.execute(sql`
      INSERT INTO wallet_transfer_allowance
        (agent_id, wallet_id, chain_id, recipients, max_transfer_units, budget_units, expires_at, created_by)
      SELECT ${agentId}, id, ${dto.chainId},
        ${JSON.stringify(recipients.map((r) => r.toLowerCase()))}::jsonb,
        ${maxPerTransfer.toString()}::numeric, ${budget.toString()}::numeric,
        ${expires.toISOString()}::timestamptz, ${createdBy}
      FROM agent_wallet
      WHERE id = ${dto.walletId}::uuid AND agent_id = ${agentId}
        AND is_active = true AND wallet_type = 'eoa'
        AND encrypted_private_key IS NOT NULL AND provider <> 'custom'
      RETURNING *`);
    if (!rows[0])
      throw new BadRequestException(
        'An active platform-managed wallet belonging to this agent is required',
      );
    return rows[0] as unknown as TransferAllowance;
  }

  async list(agentId: string): Promise<TransferAllowance[]> {
    const rows = await this.db.execute(sql`
      SELECT * FROM wallet_transfer_allowance
      WHERE agent_id = ${agentId}
      ORDER BY created_at DESC LIMIT 100`);
    return rows as unknown as TransferAllowance[];
  }

  /** Allowances the agent can still spend from right now. */
  async active(agentId: string, walletId: string, chainId?: string) {
    const rows = await this.db.execute(sql`
      SELECT * FROM wallet_transfer_allowance
      WHERE agent_id = ${agentId} AND wallet_id = ${walletId}::uuid
        AND revoked_at IS NULL AND expires_at > now()
        AND spent_units < budget_units
        ${chainId ? sql`AND chain_id = ${chainId}` : sql``}
      ORDER BY expires_at ASC`);
    return rows as unknown as TransferAllowance[];
  }

  async transfers(agentId: string): Promise<WalletTransferRecord[]> {
    const rows = await this.db.execute(sql`
      SELECT * FROM wallet_transfer
      WHERE agent_id = ${agentId}
      ORDER BY created_at DESC LIMIT 100`);
    return rows as unknown as WalletTransferRecord[];
  }

  async revoke(agentId: string, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new BadRequestException('Invalid allowance ID');
    await this.db.execute(sql`
      UPDATE wallet_transfer_allowance SET revoked_at = now()
      WHERE id = ${id}::uuid AND agent_id = ${agentId} AND revoked_at IS NULL`);
    return { revoked: true };
  }

  /**
   * Reserve budget for one transfer under a row lock, choosing the allowance
   * that expires soonest and still covers the recipient and amount. A repeated
   * idempotency key returns the earlier transfer instead of sending again.
   */
  async reserve(input: {
    agentId: string;
    walletId: string;
    chainId: string;
    to: string;
    amountUnits: bigint;
    idempotencyKey: string;
    sessionId?: string;
  }): Promise<{ transfer: WalletTransferRecord; replayed: boolean }> {
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(input.idempotencyKey))
      throw new BadRequestException('Invalid idempotency key');
    const to = input.to.toLowerCase();

    return this.db.transaction(async (tx) => {
      const allowances = (await tx.execute(sql`
        SELECT * FROM wallet_transfer_allowance
        WHERE agent_id = ${input.agentId} AND wallet_id = ${input.walletId}::uuid
          AND chain_id = ${input.chainId}
          AND revoked_at IS NULL AND expires_at > now()
        ORDER BY expires_at ASC
        FOR UPDATE`)) as unknown as TransferAllowance[];

      if (allowances.length) {
        const previous = (await tx.execute(sql`
          SELECT * FROM wallet_transfer
          WHERE idempotency_key = ${input.idempotencyKey}
            AND allowance_id IN (${sql.join(
              allowances.map((a) => sql`${a.id}::uuid`),
              sql`, `,
            )})`)) as unknown as WalletTransferRecord[];
        if (previous[0]) return { transfer: previous[0], replayed: true };
      }

      if (!allowances.length)
        throw new ForbiddenException(
          'No active transfer allowance for this network. The owner can set one in Studio → Agent → Wallet.',
        );
      const recipientAllowed = allowances.filter(
        (a) => !a.recipients?.length || a.recipients.includes(to),
      );
      if (!recipientAllowed.length)
        throw new ForbiddenException(
          'This recipient is not on the owner-approved list for this network',
        );
      const withinMax = recipientAllowed.filter(
        (a) => input.amountUnits <= BigInt(a.max_transfer_units),
      );
      if (!withinMax.length)
        throw new ForbiddenException(
          'Amount is above the owner-approved maximum per transfer',
        );
      const allowance = withinMax.find(
        (a) =>
          BigInt(a.spent_units) + input.amountUnits <= BigInt(a.budget_units),
      );
      if (!allowance)
        throw new ForbiddenException(
          'Amount exceeds the remaining transfer budget',
        );

      const inserted = (await tx.execute(sql`
        INSERT INTO wallet_transfer
          (allowance_id, agent_id, idempotency_key, chain_id, to_address, amount_units, session_id)
        VALUES (${allowance.id}::uuid, ${input.agentId}, ${input.idempotencyKey},
          ${input.chainId}, ${to}, ${input.amountUnits.toString()}::numeric,
          ${input.sessionId ?? null})
        ON CONFLICT (allowance_id, idempotency_key) DO NOTHING
        RETURNING *`)) as unknown as WalletTransferRecord[];
      if (!inserted[0])
        throw new ConflictException(
          'Transfer already attempted; check its status instead of sending again',
        );
      await tx.execute(sql`
        UPDATE wallet_transfer_allowance
        SET spent_units = spent_units + ${input.amountUnits.toString()}::numeric
        WHERE id = ${allowance.id}::uuid`);
      return { transfer: inserted[0], replayed: false };
    });
  }

  async markSent(id: string, txHash: string) {
    await this.db.execute(sql`
      UPDATE wallet_transfer SET tx_hash = ${txHash}, updated_at = now()
      WHERE id = ${id}::uuid`);
  }

  /**
   * Record the outcome. Only a definite failure (rejected before broadcast,
   * or reverted on chain) returns the reserved budget.
   */
  async finish(
    id: string,
    state: 'confirmed' | 'failed' | 'unknown',
    details: { txHash?: string; error?: string } = {},
  ) {
    await this.db.transaction(async (tx) => {
      const rows = (await tx.execute(sql`
        UPDATE wallet_transfer
        SET state = ${state}, tx_hash = COALESCE(${details.txHash ?? null}, tx_hash),
          error = ${details.error?.slice(0, 500) ?? null}, updated_at = now()
        WHERE id = ${id}::uuid AND state = 'reserved'
        RETURNING allowance_id, amount_units`)) as unknown as Array<{
        allowance_id: string;
        amount_units: string;
      }>;
      if (state === 'failed' && rows[0])
        await tx.execute(sql`
          UPDATE wallet_transfer_allowance
          SET spent_units = spent_units - ${rows[0].amount_units}::numeric
          WHERE id = ${rows[0].allowance_id}::uuid`);
    });
  }
}
