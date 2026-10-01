-- Shared replay and steering across API replicas. Events expire after the
-- client recovery window; agent state and session history use their own stores.
CREATE TABLE IF NOT EXISTS agent_run_stream (
  run_id uuid PRIMARY KEY,
  initiator text NOT NULL,
  agent_id text NOT NULL,
  session_id text,
  state text NOT NULL DEFAULT 'running',
  activity text,
  steering_ready boolean NOT NULL DEFAULT false,
  done boolean NOT NULL DEFAULT false,
  last_seq integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_run_stream_initiator ON agent_run_stream (initiator, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_stream_event (
  run_id uuid NOT NULL REFERENCES agent_run_stream(run_id) ON DELETE CASCADE,
  seq integer NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE IF NOT EXISTS agent_run_steer (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent_run_stream(run_id) ON DELETE CASCADE,
  initiator text NOT NULL,
  prompt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agent_run_steer_pending ON agent_run_steer (run_id, id) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_cli_tool_result (
  request_id uuid PRIMARY KEY,
  result text,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_cli_tool_result_expires ON agent_cli_tool_result (expires_at);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_run_stream, public.agent_run_stream_event, public.agent_run_steer, public.agent_cli_tool_result TO commons_api;
    GRANT USAGE, SELECT ON SEQUENCE public.agent_run_steer_id_seq TO commons_api;
    ALTER TABLE public.agent_run_stream ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.agent_run_stream_event ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.agent_run_steer ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.agent_cli_tool_result ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS commons_api_all ON public.agent_run_stream;
    DROP POLICY IF EXISTS commons_api_all ON public.agent_run_stream_event;
    DROP POLICY IF EXISTS commons_api_all ON public.agent_run_steer;
    DROP POLICY IF EXISTS commons_api_all ON public.agent_cli_tool_result;
    CREATE POLICY commons_api_all ON public.agent_run_stream FOR ALL TO commons_api USING (true) WITH CHECK (true);
    CREATE POLICY commons_api_all ON public.agent_run_stream_event FOR ALL TO commons_api USING (true) WITH CHECK (true);
    CREATE POLICY commons_api_all ON public.agent_run_steer FOR ALL TO commons_api USING (true) WITH CHECK (true);
    CREATE POLICY commons_api_all ON public.agent_cli_tool_result FOR ALL TO commons_api USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.agent_run_stream, public.agent_run_stream_event, public.agent_run_steer, public.agent_cli_tool_result FROM anon, authenticated;
  END IF;
END $$;
