ALTER TABLE public.agent
  ADD COLUMN IF NOT EXISTS runtime_secrets jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.agent.runtime_secrets IS
  'Field-level encrypted credentials for managed runtime channels. Never returned by runtime APIs.';
