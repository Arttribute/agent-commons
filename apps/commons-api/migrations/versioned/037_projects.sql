-- Projects group chats around shared context: instructions, Library files,
-- and Knowledge Spaces. Sessions reference their project; deleting a project
-- keeps its chats (the reference is cleared by the application).
CREATE TABLE IF NOT EXISTS project (
 project_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id text NOT NULL,
 workspace_id text,
 name text NOT NULL,
 description text,
 instructions text,
 agent_id text,
 knowledge_space_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
 library_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
 pinned boolean NOT NULL DEFAULT false,
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
 updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_project_owner ON project(owner_user_id, updated_at);

ALTER TABLE session ADD COLUMN IF NOT EXISTS project_id uuid;
CREATE INDEX IF NOT EXISTS idx_session_project_updated ON session(project_id, updated_at);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.project TO commons_api;
    ALTER TABLE public.project ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS commons_api_all ON public.project;
    CREATE POLICY commons_api_all ON public.project FOR ALL TO commons_api USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.project FROM anon, authenticated;
  END IF;
END $$;
