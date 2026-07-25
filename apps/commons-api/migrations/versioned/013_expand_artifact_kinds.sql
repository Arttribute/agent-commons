-- 013_expand_artifact_kinds.sql
-- Keep the library constraint aligned with every native artifact kind that
-- FilesService can classify and persist. The original artifact-library
-- migration predated presentation and media processing, so valid PPTX, audio,
-- and video artifacts were generated and stored but rejected at row insert.

ALTER TABLE library_item
  DROP CONSTRAINT IF EXISTS library_item_kind_check;

ALTER TABLE library_item
  ADD CONSTRAINT library_item_kind_check
  CHECK (
    kind IN (
      'image',
      'pdf',
      'spreadsheet',
      'document',
      'presentation',
      'audio',
      'video',
      'text',
      'csv',
      'code',
      'app',
      'archive',
      'other'
    )
  );
