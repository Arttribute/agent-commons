-- First-class, provider-neutral agent runtime metadata. Native agents keep
-- their current execution path; OpenClaw, Hermes and future adapters share
-- these canonical control-plane fields.

SET search_path = public, extensions;

ALTER TABLE agent
  ADD COLUMN IF NOT EXISTS runtime_type text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS runtime_version text,
  ADD COLUMN IF NOT EXISTS runtime_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS runtime_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS runtime_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS runtime_updated_at timestamptz;

UPDATE agent
SET runtime_type = 'native',
    runtime_status = COALESCE(runtime_status, 'ready'),
    runtime_config = COALESCE(runtime_config, '{}'::jsonb),
    runtime_capabilities = COALESCE(runtime_capabilities, '{}'::jsonb)
WHERE runtime_type IS NULL OR runtime_type = '';

ALTER TABLE agent
  DROP CONSTRAINT IF EXISTS agent_runtime_type_check,
  DROP CONSTRAINT IF EXISTS agent_runtime_status_check;

ALTER TABLE agent
  ADD CONSTRAINT agent_runtime_type_check
    CHECK (runtime_type IN ('native', 'openclaw', 'hermes', 'custom')),
  ADD CONSTRAINT agent_runtime_status_check
    CHECK (runtime_status IN ('disabled', 'provisioning', 'starting', 'ready', 'degraded', 'stopped', 'failed'));

CREATE INDEX IF NOT EXISTS idx_agent_runtime_type
  ON agent(runtime_type, runtime_status);

ALTER TABLE session
  ADD COLUMN IF NOT EXISTS runtime_type text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS runtime_session_id text;

CREATE INDEX IF NOT EXISTS idx_session_runtime
  ON session(agent_id, runtime_type, updated_at DESC);

ALTER TABLE usage_event
  ADD COLUMN IF NOT EXISTS runtime_type text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS usage_source text NOT NULL DEFAULT 'agent_commons';

CREATE INDEX IF NOT EXISTS idx_usage_event_runtime
  ON usage_event(agent_id, runtime_type, created_at DESC);

CREATE TABLE IF NOT EXISTS shared_memory_scope (
  scope_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id text NOT NULL,
  workspace_id text,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS shared_memory_member (
  member_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope_id uuid NOT NULL REFERENCES shared_memory_scope(scope_id) ON DELETE CASCADE,
  agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  access text NOT NULL DEFAULT 'write' CHECK (access IN ('read', 'write', 'admin')),
  joined_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_shared_memory_member_agent_scope UNIQUE (scope_id, agent_id)
);

CREATE TABLE IF NOT EXISTS shared_memory_entry (
  entry_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope_id uuid NOT NULL REFERENCES shared_memory_scope(scope_id) ON DELETE CASCADE,
  key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content text NOT NULL,
  summary text NOT NULL,
  authored_by_agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  authored_by_session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  supersedes_entry_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_shared_memory_entry_version UNIQUE (scope_id, key, version)
);

CREATE INDEX IF NOT EXISTS idx_shared_memory_scope_owner ON shared_memory_scope(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_memory_member_agent ON shared_memory_member(agent_id, scope_id);
CREATE INDEX IF NOT EXISTS idx_shared_memory_entry_scope_created ON shared_memory_entry(scope_id, created_at DESC);

COMMENT ON COLUMN agent.runtime_type IS
  'Execution adapter: native, openclaw, hermes, or a future custom runtime.';
COMMENT ON COLUMN session.runtime_session_id IS
  'Optional runtime-local handle correlated to the canonical Agent Commons session ID.';
