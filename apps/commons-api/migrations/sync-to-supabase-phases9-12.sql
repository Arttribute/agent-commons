-- ============================================================
-- Agent Commons: Phases 9–12 + Supplemental Migrations
-- Supabase Schema Sync
-- Run this AFTER sync-to-supabase.sql
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).
-- ============================================================

BEGIN;

-- ============================================================
-- PHASE 9: Agent Memory System
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_memory (
  memory_id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id          text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  session_id        uuid REFERENCES session(session_id) ON DELETE SET NULL,

  -- Memory classification
  memory_type       text NOT NULL DEFAULT 'semantic',
  -- 'episodic'   — specific events
  -- 'semantic'   — general facts
  -- 'procedural' — learned behaviours

  -- Content
  content           text NOT NULL,
  summary           text NOT NULL,

  -- Scoring / ranking
  importance_score  real NOT NULL DEFAULT 0.5,
  access_count      integer NOT NULL DEFAULT 0,
  last_accessed_at  timestamptz,

  -- Keyword tags for retrieval
  tags              jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Origin
  source_type       text NOT NULL DEFAULT 'auto',
  -- 'auto'   — extracted by consolidation LLM after session
  -- 'manual' — user explicitly added

  is_active         boolean NOT NULL DEFAULT true,
  expires_at        timestamptz,

  created_at        timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at        timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_id    ON agent_memory (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_importance  ON agent_memory (agent_id, importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_active      ON agent_memory (agent_id) WHERE is_active = true;

-- ============================================================
-- PHASE 10: Agent Wallet System
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_wallet (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id              text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,

  -- 'eoa'      — platform-managed EOA keypair (encrypted private key stored here)
  -- 'smart'    — ERC-4337 smart account (platform holds session key)
  -- 'external' — owner-connected wallet (platform holds no key)
  wallet_type           text NOT NULL DEFAULT 'eoa',

  -- The public wallet address (safe to store in plaintext)
  address               text NOT NULL,

  -- Encrypted EOA private key (AES-GCM via EncryptionService)
  -- NULL for external wallets
  encrypted_private_key text,

  -- For ERC-4337: the smart account address (the on-chain contract wallet)
  smart_account_address text,

  -- Session/spending limits granted to the session key (JSON)
  session_permissions   jsonb,

  -- Chain the wallet lives on (chain ID as string, e.g. "84532" for Base Sepolia)
  chain_id              text NOT NULL DEFAULT '84532',

  label                 text DEFAULT 'Primary',
  is_active             boolean NOT NULL DEFAULT true,

  created_at            timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at            timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_agent_wallet_agent_id ON agent_wallet (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_wallet_active   ON agent_wallet (agent_id, is_active);

-- ============================================================
-- PHASE 11: Drop legacy agent.wallet JSONB column
-- (Only runs if the column still exists)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'agent'
      AND column_name  = 'wallet'
  ) THEN
    ALTER TABLE agent DROP COLUMN wallet;
    RAISE NOTICE 'Dropped agent.wallet JSONB column';
  ELSE
    RAISE NOTICE 'agent.wallet column already removed — nothing to do';
  END IF;
END $$;

-- ============================================================
-- PHASE 12: Add trace_id to usage_event
-- ============================================================

ALTER TABLE usage_event
  ADD COLUMN IF NOT EXISTS trace_id uuid;

CREATE INDEX IF NOT EXISTS idx_usage_event_trace_id
  ON usage_event (trace_id)
  WHERE trace_id IS NOT NULL;

-- ============================================================
-- SUPPLEMENTAL: Enhanced Task Features
-- ============================================================

ALTER TABLE task
  ADD COLUMN IF NOT EXISTS tool_constraint_type  text DEFAULT 'none' NOT NULL,
  ADD COLUMN IF NOT EXISTS tool_instructions     text,
  ADD COLUMN IF NOT EXISTS recurring_session_mode text DEFAULT 'same' NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_agent_session_status_priority
  ON task (agent_id, session_id, status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_task_recurring_next_run
  ON task (is_recurring, next_run_at)
  WHERE is_recurring = true AND status = 'pending';

-- ============================================================
-- SUPPLEMENTAL: Workflow Execution Column Updates
-- ============================================================

-- Add created_at if missing
ALTER TABLE workflow_execution
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL;

-- Add node_results if missing
ALTER TABLE workflow_execution
  ADD COLUMN IF NOT EXISTS node_results jsonb;

-- Add error_message if missing (safe rename guard)
ALTER TABLE workflow_execution
  ADD COLUMN IF NOT EXISTS error_message text;

-- Make agent_id and input_data nullable (they can be null in some execution modes)
ALTER TABLE workflow_execution
  ALTER COLUMN agent_id   DROP NOT NULL,
  ALTER COLUMN input_data DROP NOT NULL;

-- ============================================================
-- SUPPLEMENTAL: Workflow Version & Template Columns
-- ============================================================

ALTER TABLE workflow
  ADD COLUMN IF NOT EXISTS version     text    DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS is_template boolean DEFAULT false;

-- ============================================================
-- SUPPLEMENTAL: agent_memory updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_agent_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_memory_updated_at ON agent_memory;
CREATE TRIGGER agent_memory_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_memory_timestamp();

-- ============================================================
-- SUPPLEMENTAL: agent_wallet updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_agent_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_wallet_updated_at ON agent_wallet;
CREATE TRIGGER agent_wallet_updated_at
  BEFORE UPDATE ON agent_wallet
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_wallet_timestamp();

COMMIT;

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT 'Phase 9-12 tables:' AS message;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('agent_memory', 'agent_wallet')
ORDER BY table_name;

SELECT 'usage_event.trace_id:' AS message;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'usage_event' AND column_name = 'trace_id';

SELECT 'agent.wallet removed:' AS message;
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent' AND column_name = 'wallet'
  ) THEN 'agent.wallet still present — check migration'
  ELSE 'agent.wallet column removed OK'
END AS status;
