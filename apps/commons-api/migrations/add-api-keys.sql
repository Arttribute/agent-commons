-- Agent Commons: Add per-principal API key auth
-- Run against Supabase SQL editor. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS api_keys (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_hash       text        NOT NULL UNIQUE,
  principal_id   text        NOT NULL,
  principal_type text        NOT NULL CHECK (principal_type IN ('user', 'agent')),
  label          text,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_used_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash  ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_principal ON api_keys (principal_id, principal_type);
CREATE INDEX IF NOT EXISTS idx_api_keys_active    ON api_keys (principal_id) WHERE active = true;

COMMIT;
