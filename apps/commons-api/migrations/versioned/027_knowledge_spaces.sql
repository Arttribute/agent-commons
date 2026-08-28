-- Native, agent-editable Markdown knowledge spaces with provider-neutral
-- metadata, explicit authorization, graph edges, revision history, and hybrid
-- retrieval units.

CREATE TABLE IF NOT EXISTS knowledge_space (
  space_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL,
  workspace_id text,
  name text NOT NULL,
  description text,
  provider text NOT NULL DEFAULT 'native',
  provider_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  color text NOT NULL DEFAULT 'teal',
  status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  auto_grant_new_agents boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT knowledge_space_provider_check
    CHECK (provider IN ('native', 'browser_filesystem')),
  CONSTRAINT knowledge_space_status_check
    CHECK (status IN ('active', 'disconnected'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_space_owner
  ON knowledge_space(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_space_workspace
  ON knowledge_space(workspace_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_space_default_owner
  ON knowledge_space(lower(owner_user_id))
  WHERE is_default = true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS knowledge_space_grant (
  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_space(space_id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  permission text NOT NULL DEFAULT 'read',
  auto_retrieve boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT knowledge_space_grant_subject_check
    CHECK (subject_type IN ('user', 'agent', 'workspace')),
  CONSTRAINT knowledge_space_grant_permission_check
    CHECK (permission IN ('read', 'write', 'manage'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_space_grant_unique
  ON knowledge_space_grant(space_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_space_grant_subject
  ON knowledge_space_grant(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS knowledge_document (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_space(space_id) ON DELETE CASCADE,
  path text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  provider_document_id text,
  provider_revision text,
  created_by_type text NOT NULL DEFAULT 'user',
  created_by_id text NOT NULL,
  updated_by_type text NOT NULL DEFAULT 'user',
  updated_by_id text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT knowledge_document_revision_check CHECK (revision > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_document_active_path
  ON knowledge_document(space_id, lower(path)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_document_space_updated
  ON knowledge_document(space_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_document_hash
  ON knowledge_document(space_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_knowledge_document_tags
  ON knowledge_document USING gin(tags);

CREATE TABLE IF NOT EXISTS knowledge_document_revision (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_document(document_id) ON DELETE CASCADE,
  revision integer NOT NULL,
  path text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  provenance_trace_id uuid,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_document_revision_unique
  ON knowledge_document_revision(document_id, revision);

CREATE TABLE IF NOT EXISTS knowledge_link (
  link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_space(space_id) ON DELETE CASCADE,
  from_document_id uuid NOT NULL REFERENCES knowledge_document(document_id) ON DELETE CASCADE,
  to_document_id uuid REFERENCES knowledge_document(document_id) ON DELETE SET NULL,
  target_path text NOT NULL,
  label text,
  relation text NOT NULL DEFAULT 'wikilink',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT knowledge_link_relation_check
    CHECK (relation IN ('wikilink', 'markdown', 'frontmatter'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_link_from
  ON knowledge_link(from_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_link_to
  ON knowledge_link(to_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_link_space
  ON knowledge_link(space_id);

CREATE TABLE IF NOT EXISTS knowledge_chunk (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_document(document_id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  heading text,
  content text NOT NULL,
  token_count integer NOT NULL,
  embedding vector(1536),
  embedding_model text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_chunk_position
  ON knowledge_chunk(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_lexical
  ON knowledge_chunk USING gin(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_embedding
  ON knowledge_chunk USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON TABLE knowledge_space IS
  'Provider-neutral Markdown knowledge boundaries shared by humans and agents.';
COMMENT ON TABLE knowledge_space_grant IS
  'Explicit subject grants; the authorization seam for future team controls.';

-- Preserve the database defense-in-depth boundary for tables introduced after
-- the original RLS migration. Authorization still happens in BrainService;
-- direct PostgREST roles receive no table access.
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    FOREACH t IN ARRAY ARRAY[
      'knowledge_space',
      'knowledge_space_grant',
      'knowledge_document',
      'knowledge_document_revision',
      'knowledge_link',
      'knowledge_chunk'
    ]
    LOOP
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO commons_api',
        t
      );
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS commons_api_all ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY commons_api_all ON public.%I FOR ALL TO commons_api USING (true) WITH CHECK (true)',
        t
      );
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
  END IF;
END $$;
