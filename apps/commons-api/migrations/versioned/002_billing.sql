-- 002_billing.sql
-- Stripe billing: customer link, subscription mirror, webhook idempotency log.

CREATE TABLE IF NOT EXISTS billing_customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id text NOT NULL,
  workspace_id text,
  stripe_customer_id text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_customer_principal_idx ON billing_customer (principal_id);
CREATE UNIQUE INDEX IF NOT EXISTS billing_customer_stripe_idx ON billing_customer (stripe_customer_id);

CREATE TABLE IF NOT EXISTS subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id text NOT NULL,
  workspace_id text,
  stripe_subscription_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  plan_key text NOT NULL,
  status text NOT NULL,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_stripe_sub_idx ON subscription (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS subscription_principal_idx ON subscription (principal_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_event (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  error text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  processed_at timestamptz
);

-- RLS parity with 001 (defense in depth): app role gets a blanket policy, the
-- PostgREST roles get nothing. No-ops on databases where 001 hasn't run (the
-- role simply may not exist yet on a very old DB — guarded below).
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    FOREACH t IN ARRAY ARRAY['billing_customer', 'subscription', 'stripe_webhook_event']
    LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO commons_api', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS commons_api_all ON public.%I', t);
      EXECUTE format('CREATE POLICY commons_api_all ON public.%I FOR ALL TO commons_api USING (true) WITH CHECK (true)', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
  END IF;
END $$;
