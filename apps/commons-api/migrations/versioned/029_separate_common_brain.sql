-- Keep the original generated "Commons Brain" as the user's existing space,
-- including any imported demo folders, and provision a separate clean default.
-- This is deliberately forward-safe for databases where migration 028 already
-- renamed the original row to "Common Brain".

UPDATE knowledge_space
SET
  name = 'Commons Brain',
  is_default = false,
  provider_config = provider_config || '{"legacyCommonsBrain":true}'::jsonb,
  updated_at = timezone('utc', now())
WHERE is_default = true
  AND name IN ('Commons Brain', 'Common Brain')
  AND deleted_at IS NULL
  AND COALESCE(provider_config ->> 'commonBrainVersion', '') <> '1';

-- Remove only untouched starter notes that the interim default-space behavior
-- added to the legacy space. A note the user changed has a different hash and
-- is deliberately preserved.
UPDATE knowledge_document document
SET
  deleted_at = timezone('utc', now()),
  updated_at = timezone('utc', now())
FROM knowledge_space legacy
WHERE document.space_id = legacy.space_id
  AND document.deleted_at IS NULL
  AND legacy.provider_config ->> 'legacyCommonsBrain' = 'true'
  AND (
    (lower(document.path) = 'welcome.md'
      AND document.content_hash = 'd3c124e344e4a0696753a7e9fe1cb35a745a869a6ba3a7033016a064a4e710a7')
    OR (lower(document.path) = 'inbox/readme.md'
      AND document.content_hash = 'af53dd0e5fb327b694039fe590d2f323dc77d3310aa729f6def3202e2297a862')
    OR (lower(document.path) = 'decisions/readme.md'
      AND document.content_hash = '3cbe8e0ca0c8eb0c6ea58c949cbcb5880b318cb8c072a596c1f3d04eb060314a')
    OR (lower(document.path) = 'templates/knowledge note.md'
      AND document.content_hash = 'c76b8945187cf961783af635324f60736a4d7c257d672913600061d312f0be4c')
  );

INSERT INTO knowledge_space (
  owner_user_id,
  workspace_id,
  name,
  description,
  provider,
  provider_config,
  color,
  status,
  is_default,
  auto_grant_new_agents
)
SELECT
  legacy.owner_user_id,
  legacy.workspace_id,
  'Common Brain',
  'Shared context for you and all of your Commons agents.',
  'native',
  '{"commonBrainVersion":1}'::jsonb,
  'teal',
  'active',
  true,
  true
FROM (
  SELECT DISTINCT ON (lower(owner_user_id))
    owner_user_id,
    workspace_id
  FROM knowledge_space
  WHERE deleted_at IS NULL
    AND provider_config ->> 'legacyCommonsBrain' = 'true'
  ORDER BY lower(owner_user_id), updated_at DESC
) legacy
WHERE NOT EXISTS (
    SELECT 1
    FROM knowledge_space current_default
    WHERE lower(current_default.owner_user_id) = lower(legacy.owner_user_id)
      AND current_default.is_default = true
      AND current_default.deleted_at IS NULL
  );
