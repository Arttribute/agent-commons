-- File attachment metadata for agent chat uploads.
-- Raw file bytes live in private S3 object storage. Postgres stores only references,
-- derived previews, hashes, and extraction metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS file_attachment (
  file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text REFERENCES agent(agent_id) ON DELETE SET NULL,
  session_id uuid REFERENCES session(session_id) ON DELETE SET NULL,
  owner_id text,
  owner_type text NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'agent', 'service')),
  workspace_id text,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  kind text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'partial', 'failed')),
  text_storage_path text,
  text_preview text,
  extracted_text_chars integer NOT NULL DEFAULT 0,
  extraction_error text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_file_attachment_agent_session
  ON file_attachment(agent_id, session_id);
CREATE INDEX IF NOT EXISTS idx_file_attachment_owner
  ON file_attachment(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_file_attachment_sha256
  ON file_attachment(sha256);

CREATE TABLE IF NOT EXISTS file_artifact (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES file_attachment(file_id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  page_number integer,
  width integer,
  height integer,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_file_artifact_file
  ON file_artifact(file_id);
CREATE INDEX IF NOT EXISTS idx_file_artifact_kind
  ON file_artifact(file_id, kind);

CREATE OR REPLACE FUNCTION update_file_attachment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS file_attachment_updated_at ON file_attachment;
CREATE TRIGGER file_attachment_updated_at
  BEFORE UPDATE ON file_attachment
  FOR EACH ROW
  EXECUTE FUNCTION update_file_attachment_timestamp();

COMMIT;
