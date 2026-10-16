// Bind every user/date filter. These queries run exclusively in read-only transactions.
// Prefer the session's actor to the agent owner for shared agents.
export const usageCTE = `with attributed_usage as (
  select u.*, coalesce(case when s.initiator like 'usr\\_%' escape '\\' then s.initiator end, a.owner_user_id) as principal_id
  from public.usage_event u join public.agent a on a.agent_id = u.agent_id
  left join public.session s on s.session_id = u.session_id
)`;
export const usageTotals = `${usageCTE}
 select count(*)::int as calls, count(distinct principal_id)::int as users,
 count(distinct agent_id)::int as agents, count(distinct session_id)::int as sessions,
 coalesce(sum(input_tokens),0)::float8 as "inputTokens", coalesce(sum(output_tokens),0)::float8 as "outputTokens",
 coalesce(sum(cached_tokens),0)::float8 as "cachedTokens", coalesce(sum(total_tokens),0)::float8 as tokens,
 coalesce(sum(cost_usd) filter(where not is_byok),0)::float8 as "platformCostUsd",
 coalesce(sum(cost_usd) filter(where is_byok),0)::float8 as "byokCostUsd", max(created_at) as "lastUsedAt"
 from attributed_usage where created_at >= $1 and ($2::text = '' or principal_id = $2)`;
export const usageModels = `${usageCTE}
 select provider, model_id as "modelId", is_byok as byok, count(*)::int as calls,
 coalesce(sum(total_tokens),0)::float8 as tokens, coalesce(sum(cost_usd),0)::float8 as "costUsd"
 from attributed_usage where created_at >= $1 and ($2::text = '' or principal_id = $2)
 group by provider,model_id,is_byok order by sum(cost_usd) desc limit 50`;
export const usageDays = `${usageCTE}
 select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as day, count(*)::int as calls,
 sum(total_tokens)::float8 as tokens, sum(cost_usd)::float8 as "costUsd"
 from attributed_usage where created_at >= $1 and ($2::text = '' or principal_id = $2)
 group by day order by day`;
export const usageCustomers = `${usageCTE}
 select principal_id as "userId", count(*)::int as calls, sum(total_tokens)::float8 as tokens,
 sum(cost_usd) filter(where not is_byok)::float8 as "costUsd",max(created_at) as "lastUsedAt"
 from attributed_usage where created_at >= $1 and ($2::text = '' or principal_id = $2)
 group by principal_id order by count(*) desc limit 50`;
export const computeTotals = `select coalesce(sum(minutes),0)::float8 as minutes,
 coalesce(sum(credits_charged),0)::float8 as credits from public.compute_usage_event
 where interval_start >= $1 and ($2::text = '' or principal_id = $2)`;
export const creditUsage = `select coalesce(sum(-amount) filter(where direction='debit'),0)::float8 as spent,
 coalesce(sum(amount) filter(where event_type='ops_credit_grant'),0)::float8 as gifted
 from public.credit_ledger_entry where voided_at is null and created_at >= $1
 and ($2::text = '' or principal_id = $2)`;

// Keep only the latest invoice state. Multiple webhook deliveries never multiply revenue.
// Checkout subscriptions are excluded: their invoice is the payment source of truth.
export const billingCTE = `with objects as (
 select event_id,type,status as webhook_status,payload->'data'->'object' as o,
 created_at as received_at, coalesce((payload->>'created')::bigint,extract(epoch from created_at)::bigint) as event_time
 from public.stripe_webhook_event where type in ('invoice.paid','invoice.payment_failed','checkout.session.completed','charge.refunded')
), ranked as (
 select *,row_number() over(partition by coalesce(o->>'id',event_id) order by event_time desc,
 case when type='invoice.paid' then 1 else 0 end desc,received_at desc) as position from objects
), payments as (
 select o->>'id' as id,o->>'customer' as "customerId",type,
 coalesce(o->>'currency','usd') as currency,
 case when type='invoice.paid' then coalesce((o->>'amount_paid')::bigint,0)
 when type='charge.refunded' then -coalesce((o->>'amount_refunded')::bigint,0)
 when type='invoice.payment_failed' then coalesce((o->>'amount_due')::bigint,0)
 else coalesce((o->>'amount_total')::bigint,0) end::float8 as amount,
 case when type='invoice.paid' or (type='checkout.session.completed' and o->>'payment_status'='paid') then 'paid'
 when type='charge.refunded' then 'refunded' when type='invoice.payment_failed' then 'failed' else 'unpaid' end as status,
 case when type='checkout.session.completed' then 'Credit top-up' when type='charge.refunded' then 'Refund' else coalesce(o->>'number','Subscription invoice') end as description,
 o->>'hosted_invoice_url' as "invoiceUrl", to_timestamp(coalesce((o->>'created')::bigint,event_time)) as "createdAt",
 o->>'subscription' as "subscriptionId",o->'lines'->'data' as lines,webhook_status as "webhookStatus"
 from ranked where position=1 and (type<>'checkout.session.completed' or o->>'mode'='payment')
)`;
export const billingPayments = `${billingCTE}
 select p.id,p."customerId",p.type,p.currency,p.amount,p.status,p.description,p."invoiceUrl",p."createdAt",p.lines,p."webhookStatus",
 b.principal_id as "userId",b.email from payments p left join public.billing_customer b on b.stripe_customer_id=p."customerId"
 where ($1::text='' or b.principal_id=$1) and p."createdAt">=$2 order by p."createdAt" desc limit 100 offset $3`;
export const billingTotals = `${billingCTE}
 select currency,count(*) filter(where p.status='paid')::int as payments,
 coalesce(sum(amount) filter(where p.status='paid'),0)::float8 as paid,
 coalesce(-sum(amount) filter(where p.status='refunded'),0)::float8 as refunded,
 count(*) filter(where p.status='failed')::int as failed
 from payments p left join public.billing_customer b on b.stripe_customer_id=p."customerId"
 where ($1::text='' or b.principal_id=$1) and p."createdAt">=$2 group by currency`;
export const billingCustomers = `select b.principal_id as "userId",b.email,b.stripe_customer_id as "customerId",
 s.plan_key as plan,s.status,s.current_period_end as "periodEnd",s.cancel_at_period_end as "cancelAtPeriodEnd",
 s.stripe_price_id as "priceId",s.stripe_subscription_id as "subscriptionId"
 from public.billing_customer b left join lateral (select * from public.subscription
 where principal_id=b.principal_id order by updated_at desc,created_at desc limit 1) s on true
 order by s.updated_at desc nulls last,b.created_at desc limit 100`;
