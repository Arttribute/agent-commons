-- Generalize trajectories beyond chat runs so workflows, automations and
-- delegated executions can use the same append-only provenance substrate.
ALTER TABLE provenance_run
  ALTER COLUMN agent_id DROP NOT NULL;

ALTER TABLE provenance_run
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'agent_run',
  ADD COLUMN IF NOT EXISTS scope_id text;

CREATE INDEX IF NOT EXISTS idx_provenance_run_scope_started
  ON provenance_run(scope_type, scope_id, started_at);

CREATE INDEX IF NOT EXISTS idx_provenance_event_session_created
  ON provenance_event(session_id, created_at);

COMMENT ON COLUMN provenance_run.scope_type IS
  'Execution surface: agent_run, workflow, task, cli, sdk, or another namespaced scope.';
