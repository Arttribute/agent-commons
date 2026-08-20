CREATE TABLE IF NOT EXISTS capability_provider (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  workspace_id text,
  capability text NOT NULL,
  provider text NOT NULL,
  display_name text,
  endpoint_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_credentials text,
  credentials_iv text,
  credentials_tag text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT capability_provider_status_check
    CHECK (status IN ('active', 'disabled', 'error'))
);

CREATE UNIQUE INDEX IF NOT EXISTS capability_provider_owner_capability_idx
  ON capability_provider (owner_id, capability);

CREATE INDEX IF NOT EXISTS capability_provider_provider_idx
  ON capability_provider (capability, provider);

ALTER TABLE agent_wallet
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'commons_mpc',
  ADD COLUMN IF NOT EXISTS provider_wallet_id text;
