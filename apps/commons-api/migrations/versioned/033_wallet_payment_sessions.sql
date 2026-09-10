-- Explicit, owner-created spending grants. Reserved amounts are retained after ambiguous
-- network failures: a lost response cannot prove an authorization was not settled.
CREATE TABLE IF NOT EXISTS wallet_payment_session (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
 wallet_id uuid NOT NULL REFERENCES agent_wallet(id) ON DELETE CASCADE,
 runtime_session_id text NOT NULL,
 policy jsonb NOT NULL,
 budget_units numeric(78,0) NOT NULL CHECK(budget_units > 0),
 reserved_units numeric(78,0) NOT NULL DEFAULT 0 CHECK(reserved_units >= 0 AND reserved_units <= budget_units),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wallet_payment_attempt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_session_id uuid NOT NULL REFERENCES wallet_payment_session(id) ON DELETE CASCADE,
 idempotency_key text NOT NULL,
 amount_units numeric(78,0) NOT NULL CHECK(amount_units > 0),
 resource text NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','settled','unknown')),
 settlement jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(payment_session_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS wallet_payment_session_agent_idx ON wallet_payment_session(agent_id);
