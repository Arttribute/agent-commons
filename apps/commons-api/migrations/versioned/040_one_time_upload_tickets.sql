-- Signed direct-upload tickets are single-use across all API replicas.
CREATE TABLE IF NOT EXISTS agent_file_upload_ticket_use (
  nonce uuid PRIMARY KEY,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_file_upload_ticket_use_used_at ON agent_file_upload_ticket_use (used_at);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    GRANT SELECT, INSERT, DELETE ON public.agent_file_upload_ticket_use TO commons_api;
    ALTER TABLE public.agent_file_upload_ticket_use ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS commons_api_all ON public.agent_file_upload_ticket_use;
    CREATE POLICY commons_api_all ON public.agent_file_upload_ticket_use FOR ALL TO commons_api USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.agent_file_upload_ticket_use FROM anon, authenticated;
  END IF;
END $$;
