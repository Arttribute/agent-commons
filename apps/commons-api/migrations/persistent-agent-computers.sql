-- Convert agent computers from per-session ephemeral runtimes into one
-- optional, persistent logical computer per agent. Existing instance rows are
-- retained as history; exactly one row per agent is marked canonical.

SET search_path = public, extensions;

ALTER TABLE agent_computer_config
  ALTER COLUMN default_mode SET DEFAULT 'persistent',
  ALTER COLUMN max_ephemeral_computers SET DEFAULT 0,
  ALTER COLUMN max_concurrent_computers SET DEFAULT 1,
  ALTER COLUMN storage_limit SET DEFAULT '20Gi';

ALTER TABLE agent_computer_config
  ADD COLUMN IF NOT EXISTS resource_profile text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS resource_mode text NOT NULL DEFAULT 'elastic',
  ADD COLUMN IF NOT EXISTS cpu_request text DEFAULT '500m',
  ADD COLUMN IF NOT EXISTS memory_request text DEFAULT '1Gi',
  ADD COLUMN IF NOT EXISTS gpu_type text,
  ADD COLUMN IF NOT EXISTS gpu_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'tier';

UPDATE agent_computer_config
SET default_mode = 'persistent',
    max_persistent_computers = 1,
    max_ephemeral_computers = 0,
    max_concurrent_computers = 1,
    updated_at = timezone('utc', now());

ALTER TABLE agent_computer_config
  DROP CONSTRAINT IF EXISTS agent_computer_config_resource_profile_check,
  DROP CONSTRAINT IF EXISTS agent_computer_config_resource_mode_check,
  DROP CONSTRAINT IF EXISTS agent_computer_config_gpu_count_check;

ALTER TABLE agent_computer_config
  ADD CONSTRAINT agent_computer_config_resource_profile_check
    CHECK (resource_profile IN ('starter', 'standard', 'performance', 'gpu')),
  ADD CONSTRAINT agent_computer_config_resource_mode_check
    CHECK (resource_mode IN ('fixed', 'elastic')),
  ADD CONSTRAINT agent_computer_config_gpu_count_check
    CHECK (gpu_count >= 0 AND gpu_count <= 8);

ALTER TABLE agent_computer_instance
  ALTER COLUMN lifecycle SET DEFAULT 'persistent';

ALTER TABLE agent_computer_instance
  ADD COLUMN IF NOT EXISTS canonical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desired_state text NOT NULL DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS resource_profile text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS resource_mode text NOT NULL DEFAULT 'elastic',
  ADD COLUMN IF NOT EXISTS cpu_request text,
  ADD COLUMN IF NOT EXISTS memory_request text,
  ADD COLUMN IF NOT EXISTS gpu_type text,
  ADD COLUMN IF NOT EXISTS gpu_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS runtime_generation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS persistent_volume_id text,
  ADD COLUMN IF NOT EXISTS compute_tenant_id text,
  ADD COLUMN IF NOT EXISTS compute_cell_id text;

-- Prefer an active persistent row, then any active row, then the newest row.
-- The chosen row becomes the stable computer record and is no longer tied to
-- the chat session that originally created it.
WITH ranked AS (
  SELECT computer_id,
         row_number() OVER (
           PARTITION BY agent_id
           ORDER BY
             CASE WHEN status IN ('running', 'idle', 'starting', 'provisioning') THEN 0 ELSE 1 END,
             CASE WHEN lifecycle = 'persistent' THEN 0 ELSE 1 END,
             created_at DESC
         ) AS position
  FROM agent_computer_instance
)
UPDATE agent_computer_instance AS computer
SET canonical = (ranked.position = 1),
    lifecycle = CASE WHEN ranked.position = 1 THEN 'persistent' ELSE computer.lifecycle END,
    session_id = CASE WHEN ranked.position = 1 THEN NULL ELSE computer.session_id END,
    expires_at = CASE WHEN ranked.position = 1 THEN NULL ELSE computer.expires_at END,
    desired_state = CASE
      WHEN ranked.position = 1 AND computer.status IN ('stopped', 'terminated') THEN 'stopped'
      ELSE computer.desired_state
    END,
    updated_at = timezone('utc', now())
FROM ranked
WHERE computer.computer_id = ranked.computer_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_computer_instance_canonical
  ON agent_computer_instance(agent_id)
  WHERE canonical = true;

CREATE INDEX IF NOT EXISTS idx_agent_computer_instance_owner
  ON agent_computer_instance(owner_user_id, agent_id)
  WHERE canonical = true;

COMMENT ON COLUMN agent_computer_instance.canonical IS
  'The one durable logical computer currently assigned to an agent; older rows are retained as history.';
COMMENT ON COLUMN agent_computer_instance.desired_state IS
  'Control-plane intent. stopped means the pod may be removed while the workspace volume remains.';
