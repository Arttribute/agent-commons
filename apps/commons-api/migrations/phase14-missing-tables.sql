-- ============================================================
-- Agent Commons: Phase 14 — Missing Tables & Columns
-- Covers: agent_log, agent_preferred_connection, resource,
--         a2a_task full schema, api_keys key_prefix column,
--         and session initiator_type column.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).
-- ============================================================

BEGIN;

-- ============================================================
-- AGENT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_log (
  log_id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  session_id    uuid REFERENCES session(session_id) ON DELETE CASCADE,
  action        text,
  message       text,
  status        text,
  response_time integer,
  tools         jsonb,
  created_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_agent_log_agent_id   ON agent_log (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_log_session_id ON agent_log (session_id);
CREATE INDEX IF NOT EXISTS idx_agent_log_created_at ON agent_log (agent_id, created_at DESC);

-- ============================================================
-- AGENT PREFERRED CONNECTION
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_preferred_connection (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id             text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  preferred_agent_id   text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  usage_comments       text,
  created_at           timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (agent_id, preferred_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_preferred_connection_agent_id ON agent_preferred_connection (agent_id);

-- ============================================================
-- RESOURCE (knowledgebase / embeddings)
-- ============================================================

CREATE TABLE IF NOT EXISTS resource (
  resource_id   text PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  resource_type text NOT NULL,
  schema        jsonb NOT NULL DEFAULT '{}',
  tags          jsonb NOT NULL DEFAULT '[]',
  resource_file text NOT NULL DEFAULT '',
  created_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_resource_type ON resource (resource_type);

-- ============================================================
-- A2A TASK — ensure table exists and has all columns
-- ============================================================

CREATE TABLE IF NOT EXISTS a2a_task (
  task_id          text PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  agent_id         text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  session_id       uuid REFERENCES session(session_id) ON DELETE SET NULL,
  state            text NOT NULL DEFAULT 'submitted',
  caller_id        text,
  caller_url       text,
  context_id       text,
  input_message    jsonb NOT NULL DEFAULT '{}',
  output_messages  jsonb,
  artifacts        jsonb,
  push_url         text,
  push_token       text,
  error            jsonb,
  created_at       timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  updated_at       timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  completed_at     timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_a2a_task_agent_id  ON a2a_task (agent_id);
CREATE INDEX IF NOT EXISTS idx_a2a_task_state     ON a2a_task (state);
CREATE INDEX IF NOT EXISTS idx_a2a_task_context   ON a2a_task (context_id) WHERE context_id IS NOT NULL;

-- ============================================================
-- AGENT — ensure A2A columns exist (idempotent from Phase 4)
-- ============================================================

ALTER TABLE agent
  ADD COLUMN IF NOT EXISTS a2a_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS a2a_skills   jsonb,
  ADD COLUMN IF NOT EXISTS a2a_endpoint text;

-- ============================================================
-- SESSION — ensure initiator_type column exists
-- ============================================================

ALTER TABLE session
  ADD COLUMN IF NOT EXISTS initiator_type text DEFAULT 'web';

-- ============================================================
-- API_KEYS — ensure key_prefix column exists
-- (some older migrations may have omitted it)
-- ============================================================

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS key_prefix text;

-- ============================================================
-- TOOL — ensure all columns added in later phases exist
-- ============================================================

ALTER TABLE tool
  ADD COLUMN IF NOT EXISTS display_name          text,
  ADD COLUMN IF NOT EXISTS api_spec              jsonb,
  ADD COLUMN IF NOT EXISTS input_schema          jsonb,
  ADD COLUMN IF NOT EXISTS output_schema         jsonb,
  ADD COLUMN IF NOT EXISTS owner                 text,
  ADD COLUMN IF NOT EXISTS owner_type            text,
  ADD COLUMN IF NOT EXISTS category              text,
  ADD COLUMN IF NOT EXISTS tags                  jsonb,
  ADD COLUMN IF NOT EXISTS icon                  text,
  ADD COLUMN IF NOT EXISTS version               text DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS is_deprecated         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS execution_count       integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_executed_at      timestamp with time zone,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer,
  ADD COLUMN IF NOT EXISTS rate_limit_per_hour   integer;

-- ============================================================
-- USAGE EVENT — ensure all columns exist
-- ============================================================

ALTER TABLE usage_event
  ADD COLUMN IF NOT EXISTS session_id      uuid REFERENCES session(session_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS input_tokens    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_usd        numeric(12, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_id        text,
  ADD COLUMN IF NOT EXISTS model_provider  text;

COMMIT;

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT 'Phase 14 — missing tables check:' AS message;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'agent_log', 'agent_preferred_connection', 'resource',
    'a2a_task', 'api_keys'
  )
ORDER BY table_name;
