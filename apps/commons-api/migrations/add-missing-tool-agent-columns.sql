-- ================================================================
-- Agent Commons: Add missing columns to tool and agent tables
-- These columns are defined in schema.ts but were never in a
-- migration file. Run this against your database to fix the
-- "column owner does not exist" error during session start.
-- Idempotent — safe to run multiple times.
-- ================================================================

BEGIN;

-- ─── TOOL TABLE ──────────────────────────────────────────────────────────────
-- Add all columns defined in schema.ts that may be missing from the DB.

ALTER TABLE tool
  ADD COLUMN IF NOT EXISTS display_name     text,
  ADD COLUMN IF NOT EXISTS description      text,
  ADD COLUMN IF NOT EXISTS api_spec         jsonb,
  ADD COLUMN IF NOT EXISTS owner            text,
  ADD COLUMN IF NOT EXISTS owner_type       text,
  ADD COLUMN IF NOT EXISTS category         text,
  ADD COLUMN IF NOT EXISTS tags             jsonb,
  ADD COLUMN IF NOT EXISTS icon             text,
  ADD COLUMN IF NOT EXISTS version          text     DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS is_deprecated    boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS execution_count  integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_executed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS secure_key_ref   text;

-- ─── AGENT TABLE ─────────────────────────────────────────────────────────────
-- Add all columns defined in schema.ts that may be missing from the DB.

ALTER TABLE agent
  ADD COLUMN IF NOT EXISTS owner                  text,
  ADD COLUMN IF NOT EXISTS name                   text,
  ADD COLUMN IF NOT EXISTS knowledgebase          jsonb,
  ADD COLUMN IF NOT EXISTS external_tools         jsonb,
  ADD COLUMN IF NOT EXISTS common_tools           jsonb,
  ADD COLUMN IF NOT EXISTS temperature            real,
  ADD COLUMN IF NOT EXISTS max_tokens             integer,
  ADD COLUMN IF NOT EXISTS top_p                  real,
  ADD COLUMN IF NOT EXISTS presence_penalty       real,
  ADD COLUMN IF NOT EXISTS frequency_penalty      real,
  ADD COLUMN IF NOT EXISTS stop_sequence          jsonb,
  ADD COLUMN IF NOT EXISTS avatar                 text,
  ADD COLUMN IF NOT EXISTS tts_provider           text,
  ADD COLUMN IF NOT EXISTS tts_voice              text,
  ADD COLUMN IF NOT EXISTS is_liaison             boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS liaison_key            text,
  ADD COLUMN IF NOT EXISTS external_url           text,
  ADD COLUMN IF NOT EXISTS external_endpoint      text,
  ADD COLUMN IF NOT EXISTS autonomy_enabled       boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS autonomous_interval_sec integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cron_job_name          text,
  ADD COLUMN IF NOT EXISTS model_provider         text    DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS model_id               text    DEFAULT 'gpt-4o',
  ADD COLUMN IF NOT EXISTS model_api_key          text,
  ADD COLUMN IF NOT EXISTS model_base_url         text,
  ADD COLUMN IF NOT EXISTS a2a_enabled            boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS a2a_skills             jsonb;

-- ─── SESSION TABLE ────────────────────────────────────────────────────────────
-- Ensure all session columns exist (session may have been created without some).

ALTER TABLE session
  ADD COLUMN IF NOT EXISTS title            text,
  ADD COLUMN IF NOT EXISTS initiator        text,
  ADD COLUMN IF NOT EXISTS model            jsonb,
  ADD COLUMN IF NOT EXISTS query            jsonb,
  ADD COLUMN IF NOT EXISTS history          jsonb,
  ADD COLUMN IF NOT EXISTS metrics          jsonb,
  ADD COLUMN IF NOT EXISTS ended_at         timestamp with time zone,
  ADD COLUMN IF NOT EXISTS spaces           jsonb,
  ADD COLUMN IF NOT EXISTS parent_session   uuid;

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tool_owner     ON tool (owner, owner_type);
CREATE INDEX IF NOT EXISTS idx_agent_owner    ON agent (owner);
CREATE INDEX IF NOT EXISTS idx_session_initiator ON session (initiator);
CREATE INDEX IF NOT EXISTS idx_session_agent_initiator ON session (agent_id, initiator);

COMMIT;

-- ─── VERIFICATION ────────────────────────────────────────────────────────────

SELECT 'Tool table columns (owner, owner_type):' AS check;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tool' AND column_name IN ('owner', 'owner_type', 'display_name', 'description')
ORDER BY column_name;

SELECT 'Agent table columns (owner, name, model_provider):' AS check;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'agent' AND column_name IN ('owner', 'name', 'model_provider', 'model_id', 'a2a_enabled')
ORDER BY column_name;

SELECT 'Session table columns (initiator, spaces):' AS check;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'session' AND column_name IN ('initiator', 'spaces', 'parent_session')
ORDER BY column_name;
