-- 005_code_projects.sql
-- Durable lightweight React projects and immutable public deployments.

CREATE TABLE IF NOT EXISTS code_project (
  project_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  owner_user_id text,
  workspace_id text,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  framework text NOT NULL DEFAULT 'react',
  entry_file text NOT NULL DEFAULT 'src/main.tsx',
  status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'private',
  latest_deployment_id uuid,
  repository_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_code_project_slug ON code_project (slug);
CREATE INDEX IF NOT EXISTS idx_code_project_agent ON code_project (agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS code_project_file (
  file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES code_project(project_id) ON DELETE CASCADE,
  path text NOT NULL,
  content text NOT NULL,
  mime_type text NOT NULL DEFAULT 'text/plain',
  size_bytes integer NOT NULL,
  checksum text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_code_project_file_path
  ON code_project_file (project_id, path);

CREATE TABLE IF NOT EXISTS code_project_deployment (
  deployment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES code_project(project_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'building',
  storage_prefix text,
  public_url text,
  build_errors jsonb,
  verification jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_code_project_deployment_project
  ON code_project_deployment (project_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    FOREACH t IN ARRAY ARRAY['code_project', 'code_project_file', 'code_project_deployment']
    LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO commons_api', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS commons_api_all ON public.%I', t);
      EXECUTE format('CREATE POLICY commons_api_all ON public.%I FOR ALL TO commons_api USING (true) WITH CHECK (true)', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
  END IF;
END $$;
