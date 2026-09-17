-- Owner-set budgets that let an agent send USDC on its own (chat, scheduled
-- tasks, heartbeats, agent-to-agent runs) without approving each transfer.
-- Spent units are reserved before signing and kept when the outcome is
-- unknown: a lost RPC response cannot prove a transaction was not broadcast.
CREATE TABLE IF NOT EXISTS wallet_transfer_allowance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
 wallet_id uuid NOT NULL REFERENCES agent_wallet(id) ON DELETE CASCADE,
 chain_id text NOT NULL,
 -- Lowercase 0x addresses. Empty means any recipient.
 recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
 max_transfer_units numeric(78,0) NOT NULL CHECK(max_transfer_units > 0),
 budget_units numeric(78,0) NOT NULL CHECK(budget_units > 0),
 spent_units numeric(78,0) NOT NULL DEFAULT 0 CHECK(spent_units >= 0 AND spent_units <= budget_units),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wallet_transfer (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 allowance_id uuid NOT NULL REFERENCES wallet_transfer_allowance(id) ON DELETE CASCADE,
 agent_id text NOT NULL,
 idempotency_key text NOT NULL,
 chain_id text NOT NULL,
 to_address text NOT NULL,
 amount_units numeric(78,0) NOT NULL CHECK(amount_units > 0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','confirmed','failed','unknown')),
 tx_hash text,
 error text,
 session_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(allowance_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS wallet_transfer_allowance_agent_idx ON wallet_transfer_allowance(agent_id);
CREATE INDEX IF NOT EXISTS wallet_transfer_agent_idx ON wallet_transfer(agent_id, created_at DESC);
