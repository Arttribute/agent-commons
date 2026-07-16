ALTER TABLE agent
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_system_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS copilot_access_mode text,
  ADD COLUMN IF NOT EXISTS copilot_scopes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS agent_default_owner_idx
  ON agent (owner_user_id)
  WHERE is_default = true AND owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS copilot_change (
  change_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  scope text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  title text NOT NULL,
  description text,
  before jsonb,
  after jsonb,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reviewed_at timestamptz,
  applied_at timestamptz,
  CONSTRAINT copilot_change_status_check
    CHECK (status IN ('pending', 'applied', 'rejected', 'reverted')),
  CONSTRAINT copilot_change_action_check
    CHECK (action IN ('create', 'update', 'delete')),
  CONSTRAINT copilot_change_scope_check
    CHECK (scope IN ('agents', 'tools', 'skills', 'tasks', 'workflows', 'account'))
);

CREATE INDEX IF NOT EXISTS copilot_change_owner_status_idx
  ON copilot_change (owner_user_id, status, created_at);

CREATE INDEX IF NOT EXISTS copilot_change_resource_idx
  ON copilot_change (resource_type, resource_id, created_at);
