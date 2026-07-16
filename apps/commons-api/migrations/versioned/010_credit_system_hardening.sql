-- 010_credit_system_hardening.sql
-- Atomic credit accounts, spend reservations, programmable reward campaigns,
-- and auditable peer-to-peer gifts.

CREATE TABLE IF NOT EXISTS credit_account (
  principal_id text PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  lifetime_granted bigint NOT NULL DEFAULT 0,
  lifetime_spent bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (reserved <= balance)
);

-- Existing ledger entries are grandfathered into the new atomic account.
INSERT INTO credit_account (principal_id, balance, lifetime_granted, lifetime_spent)
SELECT
  principal_id,
  GREATEST(0, COALESCE(sum(amount) FILTER (WHERE voided_at IS NULL), 0))::integer,
  COALESCE(sum(amount) FILTER (WHERE amount > 0 AND voided_at IS NULL), 0)::bigint,
  ABS(COALESCE(sum(amount) FILTER (WHERE amount < 0 AND voided_at IS NULL), 0))::bigint
FROM credit_ledger_entry
GROUP BY principal_id
ON CONFLICT (principal_id) DO NOTHING;

-- Only new grants participate in exact FIFO expiry. Historical credits remain
-- non-expiring so this migration cannot unexpectedly remove a user's balance.
ALTER TABLE credit_ledger_entry
  ADD COLUMN IF NOT EXISTS remaining_amount integer;
ALTER TABLE credit_ledger_entry
  ADD COLUMN IF NOT EXISTS transfer_id uuid;
CREATE INDEX IF NOT EXISTS credit_ledger_expiring_lot_idx
  ON credit_ledger_entry (principal_id, expires_at, created_at)
  WHERE remaining_amount > 0 AND voided_at IS NULL;

CREATE TABLE IF NOT EXISTS credit_reservation (
  reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id text NOT NULL REFERENCES credit_account(principal_id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  captured_amount integer NOT NULL DEFAULT 0 CHECK (captured_amount >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'captured', 'released', 'expired')),
  purpose text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  agent_id text,
  session_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (captured_amount <= amount)
);
CREATE INDEX IF NOT EXISTS credit_reservation_principal_status_idx
  ON credit_reservation (principal_id, status, expires_at);

CREATE TABLE IF NOT EXISTS credit_campaign (
  campaign_key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  reward_credits integer NOT NULL CHECK (reward_credits > 0),
  trigger_type text NOT NULL
    CHECK (trigger_type IN ('once', 'daily', 'monthly', 'event')),
  source_platform text NOT NULL DEFAULT 'system',
  starts_at timestamptz,
  ends_at timestamptz,
  max_claims_per_principal integer,
  monthly_cap_per_principal integer,
  total_budget_credits bigint,
  granted_credits bigint NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS credit_reward_claim (
  claim_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key text NOT NULL REFERENCES credit_campaign(campaign_key),
  principal_id text NOT NULL,
  workspace_id text,
  period_key text NOT NULL,
  event_id text,
  credits integer NOT NULL CHECK (credits > 0),
  ledger_entry_id uuid REFERENCES credit_ledger_entry(entry_id),
  source_platform text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (campaign_key, principal_id, period_key)
);
CREATE INDEX IF NOT EXISTS credit_reward_claim_principal_idx
  ON credit_reward_claim (principal_id, claimed_at DESC);

CREATE TABLE IF NOT EXISTS credit_transfer (
  transfer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_principal_id text NOT NULL,
  recipient_principal_id text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  message text,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'reversed')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reversed_at timestamptz,
  CHECK (sender_principal_id <> recipient_principal_id)
);
CREATE INDEX IF NOT EXISTS credit_transfer_sender_idx
  ON credit_transfer (sender_principal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_transfer_recipient_idx
  ON credit_transfer (recipient_principal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_rate_limit_bucket (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);
CREATE INDEX IF NOT EXISTS api_rate_limit_expiry_idx
  ON api_rate_limit_bucket (expires_at);

INSERT INTO credit_campaign (
  campaign_key, name, description, reward_credits, trigger_type,
  source_platform, monthly_cap_per_principal, visible, eligibility, metadata
) VALUES
  (
    'daily-check-in',
    'Daily check-in',
    'A small daily credit boost for showing up and building.',
    10,
    'daily',
    'agent_commons',
    200,
    true,
    '{"plans":["free","plus","pro","max"]}'::jsonb,
    '{"icon":"sparkles","expiresInDays":35}'::jsonb
  ),
  (
    'commonlab-course-completion',
    'Complete a CommonLab course',
    'Earn credits after completing an eligible course.',
    250,
    'event',
    'commonlab',
    1000,
    true,
    '{}'::jsonb,
    '{"eventNamespace":"course"}'::jsonb
  ),
  (
    'commonlab-skill-challenge',
    'Complete a CommonLab skill challenge',
    'Earn credits for verified practical skill challenges.',
    50,
    'event',
    'commonlab',
    500,
    true,
    '{}'::jsonb,
    '{"eventNamespace":"skill"}'::jsonb
  )
ON CONFLICT (campaign_key) DO NOTHING;

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    FOREACH t IN ARRAY ARRAY[
      'credit_account', 'credit_reservation', 'credit_campaign',
      'credit_reward_claim', 'credit_transfer', 'api_rate_limit_bucket'
    ]
    LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO commons_api', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS commons_api_all ON public.%I', t);
      EXECUTE format('CREATE POLICY commons_api_all ON public.%I FOR ALL TO commons_api USING (true) WITH CHECK (true)', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
  END IF;
END $$;
