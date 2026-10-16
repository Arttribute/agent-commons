import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import * as q from './report-queries';

export type ReportName =
  | 'summary'
  | 'account'
  | 'directory'
  | 'usage'
  | 'billing'
  | 'agents';
export const REPORTS: ReportName[] = [
  'summary',
  'account',
  'directory',
  'usage',
  'billing',
  'agents',
];
export type ReportInput = {
  userId: string;
  days: number;
  offset: number;
  ids: string[];
};

/** Parameterize fixed reporting SQL; never accept SQL text from callers. */
export function bindReport(query: string, values: unknown[]) {
  return sql.join(
    query.split(/(\$\d+)/g).map((part) => {
      if (!/^\$\d+$/.test(part)) return sql.raw(part);
      const value = values[Number(part.slice(1)) - 1];
      return sql`${value instanceof Date ? value.toISOString() : value}`;
    }),
    sql.empty(),
  );
}

@Injectable()
export class OperationsService {
  constructor(private readonly db: DatabaseService) {}
  async report(name: ReportName, input: ReportInput) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      await tx.execute(sql`set local statement_timeout = '15s'`);
      const query = async (text: string, values: unknown[] = []) =>
        Array.from(await tx.execute(bindReport(text, values)));
      const { userId, days, offset, ids } = input;
      const start = new Date(Date.now() - days * 86400_000);
      if (name === 'summary') {
        const subscriptions = await query(
          `select plan_key as "planKey",status,count(distinct principal_id)::int as users from public.subscription group by plan_key,status order by plan_key,status`,
        );
        const [accounts] = await query(
          `select count(*)::int as accounts,count(*) filter(where balance>0)::int as funded from public.credit_account`,
        );
        return {
          subscriptions,
          creditAccounts: accounts.accounts,
          fundedCreditAccounts: accounts.funded,
        };
      }
      if (name === 'account') {
        const [subscription] = await query(
          `select plan_key as "planKey",status,stripe_subscription_id as "stripeSubscriptionId",
          current_period_end as "currentPeriodEnd",cancel_at_period_end as "cancelAtPeriodEnd",updated_at as "updatedAt"
          from public.subscription where principal_id=$1 order by updated_at desc,created_at desc limit 1`,
          [userId],
        );
        const [customer] = await query(
          `select stripe_customer_id as "stripeCustomerId" from public.billing_customer where principal_id=$1 limit 1`,
          [userId],
        );
        const [credits] = await query(
          `select balance,reserved,lifetime_granted::float8 as "lifetimeGranted",lifetime_spent::float8 as "lifetimeSpent" from public.credit_account where principal_id=$1 limit 1`,
          [userId],
        );
        const ledger = await query(
          `select entry_id as "entryId",amount,direction,event_type as "eventType",source_platform as "sourcePlatform",
          description,created_at as "createdAt",coalesce(metadata->>'operatorUserId',created_by) as "createdBy",voided_at as "voidedAt"
          from public.credit_ledger_entry where principal_id=$1 order by created_at desc limit 25`,
          [userId],
        );
        return {
          environment: process.env.APP_ENV || process.env.NODE_ENV,
          subscription: subscription ?? null,
          stripeCustomerId: customer?.stripeCustomerId ?? null,
          credits: credits ?? null,
          ledger,
        };
      }
      if (name === 'directory') {
        if (!ids.length) return [];
        return query(
          `select u.id as "userId",s.plan_key as plan,s.status,c.balance,
          (select max(e.created_at) from public.usage_event e join public.agent a on a.agent_id=e.agent_id where a.owner_user_id=u.id) as "lastUsageAt"
          from jsonb_array_elements_text($1::jsonb) as u(id) left join public.credit_account c on c.principal_id=u.id
          left join lateral (select plan_key,status from public.subscription where principal_id=u.id order by updated_at desc,created_at desc limit 1) s on true`,
          [JSON.stringify(ids)],
        );
      }
      if (name === 'usage') {
        const args = [start, userId];
        const [totals] = await query(q.usageTotals, args),
          models = await query(q.usageModels, args),
          daily = await query(q.usageDays, args),
          customers = await query(q.usageCustomers, args);
        const [compute] = await query(q.computeTotals, args),
          [credits] = await query(q.creditUsage, args);
        return { totals, models, daily, customers, compute, credits };
      }
      if (name === 'billing') {
        const payments = await query(q.billingPayments, [
            userId,
            start,
            offset,
          ]),
          totals = await query(q.billingTotals, [userId, start]);
        const customers = userId ? [] : await query(q.billingCustomers);
        return { payments, totals, customers };
      }
      return query(
        `select agent_id as id,name,model_provider as provider,model_id as model,runtime_type as runtime,created_at as "createdAt"
        from public.agent where owner_user_id=$1 order by created_at desc limit 100`,
        [userId],
      );
    });
  }
}
