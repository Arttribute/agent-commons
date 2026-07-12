-- 004_feature_flags.sql
-- In-house feature flags + A/B experiments.

CREATE TABLE IF NOT EXISTS feature_flag (
  flag_key text PRIMARY KEY,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  flag_type text NOT NULL DEFAULT 'boolean',
  rollout_percentage integer NOT NULL DEFAULT 0,
  variants jsonb,
  targeting jsonb,
  salt text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS flag_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  variant_key text,
  enabled boolean,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS flag_override_subject_idx
  ON flag_override (flag_key, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS flag_exposure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  principal_id text NOT NULL,
  workspace_id text,
  variant_key text,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS flag_exposure_flag_principal_idx
  ON flag_exposure (flag_key, principal_id);

-- RLS parity with 001.
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    FOREACH t IN ARRAY ARRAY['feature_flag', 'flag_override', 'flag_exposure']
    LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO commons_api', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS commons_api_all ON public.%I', t);
      EXECUTE format('CREATE POLICY commons_api_all ON public.%I FOR ALL TO commons_api USING (true) WITH CHECK (true)', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
  END IF;
END $$;
