-- ============================================================
-- Agent Commons: Phase 13 — Sync Missing Tables & Columns
-- Covers: space_member, space_message, and any columns added
--         since the phases 9-12 sync.
-- Run AFTER sync-to-supabase.sql AND sync-to-supabase-phases9-12.sql
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).
-- ============================================================

BEGIN;

-- ============================================================
-- SPACE MEMBER
-- ============================================================

CREATE TABLE IF NOT EXISTS space_member (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id        uuid NOT NULL REFERENCES space(space_id) ON DELETE CASCADE,
  member_id       text NOT NULL,
  member_type     text NOT NULL CHECK (member_type IN ('agent', 'human')),
  role            text DEFAULT 'member',
  status          text DEFAULT 'active',
  permissions     jsonb,
  joined_at       timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  last_active_at  timestamp with time zone,
  is_subscribed   boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_space_member_space_id  ON space_member (space_id);
CREATE INDEX IF NOT EXISTS idx_space_member_member_id ON space_member (member_id);

-- ============================================================
-- SPACE MESSAGE
-- ============================================================

CREATE TABLE IF NOT EXISTS space_message (
  message_id    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id      uuid NOT NULL REFERENCES space(space_id) ON DELETE CASCADE,
  sender_id     text NOT NULL,
  sender_type   text NOT NULL CHECK (sender_type IN ('agent', 'human')),
  target_type   text DEFAULT 'broadcast',
  target_ids    jsonb,
  content       text NOT NULL,
  message_type  text DEFAULT 'text',
  metadata      jsonb,
  is_edited     boolean DEFAULT false,
  is_deleted    boolean DEFAULT false,
  created_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  updated_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_space_message_space_id  ON space_message (space_id);
CREATE INDEX IF NOT EXISTS idx_space_message_sender_id ON space_message (sender_id);
CREATE INDEX IF NOT EXISTS idx_space_message_created_at ON space_message (space_id, created_at DESC);

-- ============================================================
-- AGENT TABLE — ensure all Phase 1 columns exist
-- (autonomy, model provider, temperature, api key/base url)
-- ============================================================

ALTER TABLE agent
  ADD COLUMN IF NOT EXISTS autonomy_enabled        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autonomous_interval_sec integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_provider          text DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS model_id                text DEFAULT 'gpt-4o',
  ADD COLUMN IF NOT EXISTS model_api_key           text,
  ADD COLUMN IF NOT EXISTS model_base_url          text,
  ADD COLUMN IF NOT EXISTS temperature             real,
  ADD COLUMN IF NOT EXISTS max_tokens              integer,
  ADD COLUMN IF NOT EXISTS top_p                   real,
  ADD COLUMN IF NOT EXISTS presence_penalty        real,
  ADD COLUMN IF NOT EXISTS frequency_penalty       real;

-- ============================================================
-- TASK TABLE — ensure all scheduler/recurring columns exist
-- ============================================================

ALTER TABLE task
  ADD COLUMN IF NOT EXISTS is_recurring          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_session_mode text DEFAULT 'same',
  ADD COLUMN IF NOT EXISTS next_run_at           timestamp with time zone,
  ADD COLUMN IF NOT EXISTS scheduled_for         timestamp with time zone,
  ADD COLUMN IF NOT EXISTS priority              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tool_constraint_type  text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS tool_instructions     text,
  ADD COLUMN IF NOT EXISTS context               jsonb,
  ADD COLUMN IF NOT EXISTS result_content        jsonb,
  ADD COLUMN IF NOT EXISTS summary               text,
  ADD COLUMN IF NOT EXISTS error_message         text,
  ADD COLUMN IF NOT EXISTS progress              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_start          timestamp with time zone,
  ADD COLUMN IF NOT EXISTS actual_end            timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at          timestamp with time zone,
  ADD COLUMN IF NOT EXISTS timeout_ms            integer;

-- ============================================================
-- SCHEDULED TASK RUN — ensure table exists
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_task_run (
  run_id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id       uuid NOT NULL REFERENCES task(task_id) ON DELETE CASCADE,
  session_id    uuid REFERENCES session(session_id) ON DELETE SET NULL,
  scheduled_for timestamp with time zone NOT NULL,
  started_at    timestamp with time zone,
  completed_at  timestamp with time zone,
  status        text NOT NULL DEFAULT 'pending',
  triggered_by  text DEFAULT 'cron',
  error_message text,
  result        jsonb,
  created_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_run_task_id ON scheduled_task_run (task_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_run_status  ON scheduled_task_run (status, scheduled_for)
  WHERE status IN ('pending', 'running');

-- ============================================================
-- USAGE EVENT — ensure trace_id column exists
-- ============================================================

ALTER TABLE usage_event
  ADD COLUMN IF NOT EXISTS trace_id text;

-- ============================================================
-- SKILL TABLE — ensure it exists (Phase 6)
-- ============================================================

CREATE TABLE IF NOT EXISTS skill (
  skill_id      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  content       text NOT NULL,
  owner_id      text NOT NULL,
  owner_type    text NOT NULL DEFAULT 'user',
  is_public     boolean NOT NULL DEFAULT false,
  tags          text[],
  category      text,
  created_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  updated_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_skill_owner      ON skill (owner_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_skill_public     ON skill (is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_skill_slug       ON skill (slug);

-- ============================================================
-- API KEY TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS api_key (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  principal_id   text NOT NULL,
  principal_type text NOT NULL DEFAULT 'user',
  key_hash       text NOT NULL UNIQUE,
  key_prefix     text NOT NULL,
  label          text,
  last_used_at   timestamp with time zone,
  expires_at     timestamp with time zone,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_api_key_principal ON api_key (principal_id, principal_type);
CREATE INDEX IF NOT EXISTS idx_api_key_hash      ON api_key (key_hash);

-- ============================================================
-- MCP SYSTEM (ensure tables exist)
-- ============================================================

CREATE TABLE IF NOT EXISTS mcp_server (
  server_id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               text NOT NULL,
  description        text,
  connection_type    text NOT NULL DEFAULT 'stdio',
  connection_config  jsonb NOT NULL DEFAULT '{}',
  is_public          boolean NOT NULL DEFAULT false,
  tags               text[],
  owner_id           text NOT NULL,
  owner_type         text NOT NULL DEFAULT 'user',
  is_connected       boolean NOT NULL DEFAULT false,
  last_synced_at     timestamp with time zone,
  created_at         timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  updated_at         timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS mcp_tool (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id     uuid NOT NULL REFERENCES mcp_server(server_id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  input_schema  jsonb,
  created_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (server_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_server_owner  ON mcp_server (owner_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_server   ON mcp_tool (server_id);

COMMIT;

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT 'Phase 13 tables:' AS message;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'space_member', 'space_message', 'scheduled_task_run',
    'skill', 'api_key', 'mcp_server', 'mcp_tool'
  )
ORDER BY table_name;

SELECT 'Agent autonomy columns:' AS message;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'agent'
  AND column_name IN ('autonomy_enabled', 'autonomous_interval_sec', 'model_provider', 'model_id');
