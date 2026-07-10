-- Agent computers: per-agent CommonOS pod runtime configuration, instances, and events.

SET search_path = public, extensions;

CREATE TABLE IF NOT EXISTS agent_computer_config (
  config_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  default_mode text NOT NULL DEFAULT 'persistent',
  auto_start boolean NOT NULL DEFAULT false,
  allow_agent_start boolean NOT NULL DEFAULT true,
  allow_user_select boolean NOT NULL DEFAULT true,
  allow_browser boolean NOT NULL DEFAULT true,
  allow_terminal boolean NOT NULL DEFAULT true,
  allow_filesystem boolean NOT NULL DEFAULT true,
  network_access text NOT NULL DEFAULT 'standard',
  max_persistent_computers integer NOT NULL DEFAULT 1,
  max_ephemeral_computers integer NOT NULL DEFAULT 0,
  max_concurrent_computers integer NOT NULL DEFAULT 1,
  idle_ttl_minutes integer NOT NULL DEFAULT 60,
  session_ttl_minutes integer NOT NULL DEFAULT 180,
  image text,
  resource_profile text NOT NULL DEFAULT 'standard',
  resource_mode text NOT NULL DEFAULT 'elastic',
  cpu_request text DEFAULT '500m',
  cpu_limit text DEFAULT '2',
  memory_request text DEFAULT '1Gi',
  memory_limit text DEFAULT '4Gi',
  storage_limit text DEFAULT '20Gi',
  gpu_type text,
  gpu_count integer NOT NULL DEFAULT 0,
  billing_mode text NOT NULL DEFAULT 'tier',
  region text,
  provider text NOT NULL DEFAULT 'commonos',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_computer_config_agent
  ON agent_computer_config(agent_id);

CREATE TABLE IF NOT EXISTS agent_computer_instance (
  computer_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  owner_user_id text,
  workspace_id text,
  name text NOT NULL,
  lifecycle text NOT NULL DEFAULT 'persistent',
  canonical boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'provisioning',
  desired_state text NOT NULL DEFAULT 'running',
  provider text NOT NULL DEFAULT 'commonos',
  cloud_provider text,
  region text,
  namespace_id text,
  pod_name text,
  common_os_fleet_id text,
  common_os_agent_id text,
  image text,
  resource_profile text NOT NULL DEFAULT 'standard',
  resource_mode text NOT NULL DEFAULT 'elastic',
  cpu_request text,
  cpu_limit text,
  memory_request text,
  memory_limit text,
  storage_limit text,
  gpu_type text,
  gpu_count integer NOT NULL DEFAULT 0,
  runtime_generation integer NOT NULL DEFAULT 0,
  persistent_volume_id text,
  compute_tenant_id text,
  compute_cell_id text,
  workspace_root text DEFAULT '/mnt/shared',
  workspace_snapshot text,
  browser jsonb,
  terminal jsonb,
  metadata jsonb,
  last_activity_at timestamptz,
  expires_at timestamptz,
  started_at timestamptz,
  stopped_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_agent_computer_instance_agent_status
  ON agent_computer_instance(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_agent_computer_instance_session
  ON agent_computer_instance(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_computer_instance_commonos
  ON agent_computer_instance(common_os_agent_id);

CREATE TABLE IF NOT EXISTS agent_computer_event (
  event_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  computer_id uuid NOT NULL REFERENCES agent_computer_instance(computer_id) ON DELETE CASCADE,
  agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'agent',
  actor_id text,
  summary text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_agent_computer_event_computer
  ON agent_computer_event(computer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_computer_event_session
  ON agent_computer_event(session_id, created_at);
