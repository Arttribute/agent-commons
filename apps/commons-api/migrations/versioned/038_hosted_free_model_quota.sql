-- Atomic daily allowances for the hosted free model. The API alone writes
-- these tables; browsers never receive the inference service credential.
CREATE TABLE IF NOT EXISTS hosted_free_daily_quota (
  scope text NOT NULL CHECK (scope IN ('user', 'global')),
  scope_id text NOT NULL,
  quota_day date NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  reserved_tokens bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, scope_id, quota_day)
);

CREATE TABLE IF NOT EXISTS hosted_free_run (
  trace_id text PRIMARY KEY,
  principal_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_hosted_free_run_active ON hosted_free_run (principal_id, started_at) WHERE finished_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.hosted_free_daily_quota, public.hosted_free_run TO commons_api;
    ALTER TABLE public.hosted_free_daily_quota ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.hosted_free_run ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS commons_api_all ON public.hosted_free_daily_quota;
    DROP POLICY IF EXISTS commons_api_all ON public.hosted_free_run;
    CREATE POLICY commons_api_all ON public.hosted_free_daily_quota FOR ALL TO commons_api USING (true) WITH CHECK (true);
    CREATE POLICY commons_api_all ON public.hosted_free_run FOR ALL TO commons_api USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.hosted_free_daily_quota, public.hosted_free_run FROM anon, authenticated;
  END IF;
END $$;
