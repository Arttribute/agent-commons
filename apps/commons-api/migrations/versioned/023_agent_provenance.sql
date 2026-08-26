CREATE TABLE IF NOT EXISTS provenance_run (
  trace_id uuid PRIMARY KEY,
  session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  initiator text,
  workspace_id text,
  status text NOT NULL DEFAULT 'running',
  capture_mode text NOT NULL DEFAULT 'metadata'
    CHECK (capture_mode IN ('metadata', 'full')),
  provider text,
  model_id text,
  onchain_requested boolean NOT NULL DEFAULT false,
  event_count integer NOT NULL DEFAULT 0,
  dropped_event_count integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,
  cost_usd real NOT NULL DEFAULT 0,
  duration_ms integer,
  bundle_hash text,
  anchor_provider text,
  anchor_status text NOT NULL DEFAULT 'not_requested',
  anchor_ref text,
  anchor_metadata jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_provenance_run_session_started
  ON provenance_run(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_provenance_run_agent_started
  ON provenance_run(agent_id, started_at);
CREATE INDEX IF NOT EXISTS idx_provenance_run_anchor_status
  ON provenance_run(anchor_status, updated_at);

CREATE TABLE IF NOT EXISTS provenance_event (
  event_id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  trace_id uuid NOT NULL REFERENCES provenance_run(trace_id) ON DELETE CASCADE,
  session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  sequence integer NOT NULL,
  category text NOT NULL,
  event_type text NOT NULL,
  name text NOT NULL,
  phase text,
  status text NOT NULL DEFAULT 'completed',
  span_id text,
  parent_span_id text,
  summary text,
  payload jsonb,
  result jsonb,
  content_hash text,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  cost_usd real,
  duration_ms integer,
  eaa_action jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_provenance_event_trace_sequence UNIQUE (trace_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_provenance_event_trace_started
  ON provenance_event(trace_id, started_at);
CREATE INDEX IF NOT EXISTS idx_provenance_event_session_started
  ON provenance_event(session_id, started_at);
CREATE INDEX IF NOT EXISTS idx_provenance_event_category
  ON provenance_event(category, started_at);

COMMENT ON TABLE provenance_event IS
  'Append-only Agent Commons trajectory facts; raw payloads exist only for explicit full capture.';
