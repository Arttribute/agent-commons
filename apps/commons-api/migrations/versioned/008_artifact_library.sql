-- 008_artifact_library.sql
-- Replaces the unowned resource/embedding tables and chat-only attachments
-- with a private-by-default, S3-backed artifact library.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS library_item (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL,
  workspace_id text,
  source_agent_id text REFERENCES agent(agent_id) ON DELETE SET NULL,
  source_session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'pdf', 'spreadsheet', 'document', 'text', 'csv', 'code', 'app', 'archive', 'other')),
  name text NOT NULL,
  description text,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'agent_generated', 'code_project', 'migration')),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('processing', 'ready', 'partial', 'quarantined', 'failed', 'deleted')),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
  text_preview text,
  extracted_text_chars integer NOT NULL DEFAULT 0 CHECK (extracted_text_chars >= 0),
  extraction_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_favorite boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_library_item_owner ON library_item (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_item_workspace ON library_item (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_item_source_session ON library_item (source_session_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_item_sha256 ON library_item (owner_user_id, sha256);
CREATE INDEX IF NOT EXISTS idx_library_item_kind ON library_item (owner_user_id, kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_item_search ON library_item USING gin (
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(text_preview, ''))
);

CREATE TABLE IF NOT EXISTS library_preference (
  owner_user_id text PRIMARY KEY,
  default_storage_provider text NOT NULL DEFAULT 's3'
    CHECK (default_storage_provider IN ('s3', 'ipfs')),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS library_blob (
  blob_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES library_item(item_id) ON DELETE CASCADE,
  role text NOT NULL,
  storage_provider text NOT NULL DEFAULT 's3' CHECK (storage_provider IN ('s3', 'ipfs')),
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  page_number integer,
  width integer,
  height integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_library_blob_item ON library_blob (item_id);
CREATE INDEX IF NOT EXISTS idx_library_blob_role ON library_blob (item_id, role);

CREATE TABLE IF NOT EXISTS library_chunk (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES library_item(item_id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  token_count integer NOT NULL CHECK (token_count >= 0),
  embedding vector(1536),
  embedding_model text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (item_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_library_chunk_text ON library_chunk USING gin (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_library_chunk_embedding ON library_chunk
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS library_grant (
  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES library_item(item_id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'agent', 'workspace')),
  subject_id text NOT NULL,
  permission text NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'edit', 'manage')),
  created_by text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (item_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_library_grant_subject ON library_grant (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS library_link (
  link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES library_item(item_id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('session', 'code_project')),
  scope_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (item_id, scope_type, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_library_link_scope ON library_link (scope_type, scope_id);

CREATE TABLE IF NOT EXISTS library_share_link (
  share_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES library_item(item_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  permission text NOT NULL DEFAULT 'read' CHECK (permission = 'read'),
  created_by text NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_library_share_item ON library_share_link (item_id);

CREATE TABLE IF NOT EXISTS library_audit_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES library_item(item_id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'agent', 'service', 'share_link')),
  actor_id text NOT NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_library_audit_item ON library_audit_event (item_id, created_at DESC);

ALTER TABLE code_project
  ADD COLUMN IF NOT EXISTS library_item_id uuid REFERENCES library_item(item_id) ON DELETE SET NULL;
ALTER TABLE code_project ALTER COLUMN framework SET DEFAULT 'nextjs';
ALTER TABLE code_project ALTER COLUMN entry_file SET DEFAULT 'app/page.tsx';

-- Preserve existing S3 objects while moving their metadata and provenance into
-- the new authorization model. Agent-created rows inherit the agent owner.
DO $$
BEGIN
  IF to_regclass('public.file_attachment') IS NOT NULL THEN
    INSERT INTO library_item (
      item_id, owner_user_id, workspace_id, source_agent_id, source_session_id,
      kind, name, mime_type, size_bytes, sha256, source, status, text_preview,
      extracted_text_chars, extraction_error, metadata, created_at, updated_at
    )
    SELECT
      f.file_id,
      coalesce(
        CASE WHEN f.owner_type = 'user' THEN f.owner_id END,
        a.owner_user_id,
        a.owner,
        'legacy-unowned:' || f.file_id::text
      ),
      coalesce(f.workspace_id, a.workspace_id),
      f.agent_id,
      f.session_id,
      CASE WHEN f.kind IN ('image','pdf','spreadsheet','document','text','csv') THEN f.kind ELSE 'other' END,
      f.original_name,
      f.mime_type,
      f.size_bytes,
      f.sha256,
      CASE WHEN f.owner_type = 'agent' THEN 'agent_generated' ELSE 'migration' END,
      CASE WHEN f.status IN ('ready','partial','failed') THEN f.status ELSE 'partial' END,
      f.text_preview,
      f.extracted_text_chars,
      f.extraction_error,
      coalesce(f.metadata, '{}'::jsonb),
      f.created_at,
      f.updated_at
    FROM file_attachment f
    LEFT JOIN agent a ON a.agent_id = f.agent_id
    ON CONFLICT (item_id) DO NOTHING;

    INSERT INTO library_blob (
      item_id, role, storage_bucket, storage_path, mime_type, size_bytes, metadata, created_at
    )
    SELECT file_id, 'original', storage_bucket, storage_path, mime_type, size_bytes,
      jsonb_build_object('migrated', true), created_at
    FROM file_attachment
    ON CONFLICT (blob_id) DO NOTHING;

    INSERT INTO library_blob (
      blob_id, item_id, role, storage_bucket, storage_path, mime_type, size_bytes,
      page_number, width, height, metadata, created_at
    )
    SELECT artifact_id, file_id, kind, storage_bucket, storage_path, mime_type,
      size_bytes, page_number, width, height, coalesce(metadata, '{}'::jsonb), created_at
    FROM file_artifact
    ON CONFLICT (blob_id) DO NOTHING;

    INSERT INTO library_blob (
      item_id, role, storage_bucket, storage_path, mime_type, size_bytes, metadata, created_at
    )
    SELECT file_id, 'extracted_text', storage_bucket, text_storage_path,
      'text/plain; charset=utf-8', extracted_text_chars, '{}'::jsonb, created_at
    FROM file_attachment
    WHERE text_storage_path IS NOT NULL
    ON CONFLICT (blob_id) DO NOTHING;

    INSERT INTO library_link (item_id, scope_type, scope_id, created_at)
    SELECT file_id, 'session', session_id::text, created_at
    FROM file_attachment WHERE session_id IS NOT NULL
    ON CONFLICT (item_id, scope_type, scope_id) DO NOTHING;
  END IF;
END $$;

-- Existing code projects become first-class library apps.
INSERT INTO library_item (
  owner_user_id, workspace_id, source_agent_id, source_session_id, kind, name,
  description, mime_type, size_bytes, sha256, source, status, metadata,
  created_at, updated_at
)
SELECT
  coalesce(p.owner_user_id, a.owner_user_id, a.owner, 'legacy-unowned:' || p.project_id::text),
  coalesce(p.workspace_id, a.workspace_id), p.agent_id, p.session_id, 'app', p.name,
  p.description, 'application/vnd.agent-commons.nextjs-project',
  coalesce((SELECT sum(f.size_bytes)::integer FROM code_project_file f WHERE f.project_id = p.project_id), 0),
  encode(digest(p.project_id::text || ':' || p.updated_at::text, 'sha256'), 'hex'),
  'code_project', CASE WHEN p.status = 'failed' THEN 'partial' ELSE 'ready' END,
  jsonb_build_object('projectId', p.project_id, 'framework', p.framework), p.created_at, p.updated_at
FROM code_project p
JOIN agent a ON a.agent_id = p.agent_id
WHERE p.library_item_id IS NULL;

UPDATE code_project p
SET library_item_id = i.item_id
FROM library_item i
WHERE p.library_item_id IS NULL
  AND i.source = 'code_project'
  AND i.metadata->>'projectId' = p.project_id::text;

INSERT INTO library_link (item_id, scope_type, scope_id)
SELECT library_item_id, 'code_project', project_id::text
FROM code_project WHERE library_item_id IS NOT NULL
ON CONFLICT (item_id, scope_type, scope_id) DO NOTHING;

INSERT INTO library_chunk (item_id, chunk_index, content, token_count, metadata)
SELECT item_id, 0, text_preview, greatest(1, ceil(length(text_preview) / 4.0)::integer),
  jsonb_build_object('migrated', true)
FROM library_item
WHERE text_preview IS NOT NULL AND length(text_preview) > 0
ON CONFLICT (item_id, chunk_index) DO NOTHING;

-- The legacy resource rows have no owner dimension and cannot be migrated
-- without risking cross-tenant disclosure. They are intentionally discarded.
DROP TABLE IF EXISTS file_artifact CASCADE;
DROP TABLE IF EXISTS file_attachment CASCADE;
DROP TABLE IF EXISTS resource CASCADE;
DROP TABLE IF EXISTS embedding CASCADE;

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    FOREACH t IN ARRAY ARRAY[
      'library_item', 'library_preference', 'library_blob', 'library_chunk', 'library_grant',
      'library_link', 'library_share_link', 'library_audit_event'
    ]
    LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO commons_api', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS commons_api_all ON public.%I', t);
      EXECUTE format('CREATE POLICY commons_api_all ON public.%I FOR ALL TO commons_api USING (true) WITH CHECK (true)', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
  END IF;
END $$;
