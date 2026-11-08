CREATE TABLE IF NOT EXISTS project_page (
  page_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(project_id) ON DELETE CASCADE,
  code_project_id uuid NOT NULL REFERENCES code_project(project_id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  slug text NOT NULL,
  surface text NOT NULL DEFAULT 'commons' CHECK (surface IN ('commons', 'commonlab', 'business')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  revision integer NOT NULL DEFAULT 0,
  assets_enabled boolean NOT NULL DEFAULT false,
  draft_config jsonb NOT NULL DEFAULT '{}',
  published_config jsonb,
  published_deployment_id uuid,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_page_deployment_fk FOREIGN KEY (published_deployment_id, code_project_id)
    REFERENCES code_project_deployment(deployment_id, project_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_page_slug_idx ON project_page(slug);
CREATE UNIQUE INDEX IF NOT EXISTS project_page_code_idx ON project_page(code_project_id);
CREATE INDEX IF NOT EXISTS project_page_owner_idx ON project_page(owner_user_id, project_id);
