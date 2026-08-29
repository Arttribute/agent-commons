-- Durable Knowledge Space folders and migration-safe naming for the default
-- shared space. Documents continue to store their complete portable path.

CREATE TABLE IF NOT EXISTS knowledge_folder (
  folder_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_space(space_id) ON DELETE CASCADE,
  path text NOT NULL,
  created_by_type text NOT NULL DEFAULT 'user',
  created_by_id text NOT NULL,
  updated_by_type text NOT NULL DEFAULT 'user',
  updated_by_id text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_folder_active_path
  ON knowledge_folder(space_id, lower(path)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_folder_space_path
  ON knowledge_folder(space_id, path);

-- Backfill the hierarchy for notes created before folders became durable.
INSERT INTO knowledge_folder (
  space_id,
  path,
  created_by_type,
  created_by_id,
  updated_by_type,
  updated_by_id
)
SELECT DISTINCT
  document.space_id,
  array_to_string((split.value)[1:hierarchy.depth], '/'),
  'user',
  space.owner_user_id,
  'user',
  space.owner_user_id
FROM knowledge_document document
JOIN knowledge_space space ON space.space_id = document.space_id
CROSS JOIN LATERAL (
  SELECT regexp_split_to_array(document.path, '/') AS value
) AS split
CROSS JOIN LATERAL generate_series(
  1,
  array_length(split.value, 1) - 1
) AS hierarchy(depth)
WHERE document.deleted_at IS NULL
  AND array_length(split.value, 1) > 1
ON CONFLICT (space_id, (lower(path))) WHERE deleted_at IS NULL DO NOTHING;

-- Preserve user-customized names; only migrate the original generated name.
UPDATE knowledge_space
SET name = 'Common Brain', updated_at = timezone('utc', now())
WHERE is_default = true AND name = 'Commons Brain' AND deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_folder TO commons_api;
    ALTER TABLE public.knowledge_folder ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS commons_api_all ON public.knowledge_folder;
    CREATE POLICY commons_api_all ON public.knowledge_folder
      FOR ALL TO commons_api USING (true) WITH CHECK (true);
    REVOKE ALL ON public.knowledge_folder FROM anon, authenticated;
  END IF;
END $$;
