CREATE TABLE IF NOT EXISTS canvas_project (
  project_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL,
  workspace_id text,
  name text NOT NULL,
  description text,
  root_item_id uuid NOT NULL REFERENCES library_item(item_id) ON DELETE RESTRICT,
  active_item_id uuid NOT NULL REFERENCES library_item(item_id) ON DELETE RESTRICT,
  settings jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_canvas_project_owner_updated
  ON canvas_project(owner_user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_canvas_project_root
  ON canvas_project(owner_user_id, root_item_id);

CREATE TABLE IF NOT EXISTS canvas_revision (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES canvas_project(project_id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES library_item(item_id) ON DELETE RESTRICT,
  parent_revision_id uuid REFERENCES canvas_revision(revision_id) ON DELETE SET NULL,
  operation text NOT NULL DEFAULT 'import',
  provider text,
  model_id text,
  prompt_hash text,
  inputs jsonb DEFAULT '[]'::jsonb,
  settings jsonb DEFAULT '{}'::jsonb,
  trace_id uuid,
  created_by_type text NOT NULL DEFAULT 'human',
  created_by_id text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_canvas_revision_project_created
  ON canvas_revision(project_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canvas_revision_project_item
  ON canvas_revision(project_id, item_id);

CREATE TABLE IF NOT EXISTS canvas_annotation (
  annotation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES canvas_project(project_id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES canvas_revision(revision_id) ON DELETE CASCADE,
  parent_annotation_id uuid REFERENCES canvas_annotation(annotation_id) ON DELETE CASCADE,
  kind text NOT NULL,
  body text NOT NULL,
  geometry jsonb,
  start_ms integer,
  end_ms integer,
  status text NOT NULL DEFAULT 'open',
  author_type text NOT NULL DEFAULT 'human',
  author_id text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT canvas_annotation_time_range_check CHECK (
    (start_ms IS NULL OR start_ms >= 0) AND
    (end_ms IS NULL OR end_ms >= coalesce(start_ms, 0))
  )
);

CREATE INDEX IF NOT EXISTS idx_canvas_annotation_revision
  ON canvas_annotation(project_id, revision_id, created_at);

CREATE TABLE IF NOT EXISTS media_generation_job (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES canvas_project(project_id) ON DELETE SET NULL,
  owner_user_id text NOT NULL,
  workspace_id text,
  agent_id text REFERENCES agent(agent_id) ON DELETE SET NULL,
  session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  trace_id uuid,
  provider text NOT NULL,
  model_id text NOT NULL,
  media_kind text NOT NULL,
  operation text NOT NULL,
  prompt text NOT NULL,
  input_item_ids jsonb DEFAULT '[]'::jsonb,
  request jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  provider_operation_id text,
  output_item_id uuid REFERENCES library_item(item_id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  estimated_cost_usd real,
  actual_cost_usd real,
  billing jsonb DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_media_job_owner_created
  ON media_generation_job(owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_media_job_project_created
  ON media_generation_job(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_media_job_queue
  ON media_generation_job(status, created_at);

-- Canvas links group existing private Library items without changing access.
ALTER TABLE library_link DROP CONSTRAINT IF EXISTS library_link_scope_type_check;
ALTER TABLE library_link ADD CONSTRAINT library_link_scope_type_check
  CHECK (scope_type IN (
    'session', 'code_project', 'agent', 'provenance_trace',
    'task', 'workflow', 'cli_run', 'sdk_run', 'canvas_project'
  ));
