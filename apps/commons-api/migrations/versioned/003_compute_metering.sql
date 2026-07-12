-- 003_compute_metering.sql
-- Per-minute computer-use metering.

ALTER TABLE agent_computer_instance
  ADD COLUMN IF NOT EXISTS metered_through_at timestamptz;

CREATE TABLE IF NOT EXISTS compute_usage_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computer_id uuid NOT NULL,
  agent_id text NOT NULL,
  principal_id text NOT NULL,
  workspace_id text,
  resource_profile text NOT NULL,
  interval_start timestamptz NOT NULL,
  interval_end timestamptz NOT NULL,
  minutes integer NOT NULL,
  credits_charged integer NOT NULL,
  credit_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS compute_usage_computer_interval_idx
  ON compute_usage_event (computer_id, interval_start);
CREATE INDEX IF NOT EXISTS compute_usage_principal_idx
  ON compute_usage_event (principal_id, created_at);

-- RLS parity with 001.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.compute_usage_event TO commons_api;
    ALTER TABLE public.compute_usage_event ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS commons_api_all ON public.compute_usage_event;
    CREATE POLICY commons_api_all ON public.compute_usage_event
      FOR ALL TO commons_api USING (true) WITH CHECK (true);
    REVOKE ALL ON public.compute_usage_event FROM anon, authenticated;
  END IF;
END $$;
