-- Artifact provenance resolves derivations through the source artifact id
-- stored in metadata. Keep that lookup indexed and exclude deleted revisions
-- so opening the provenance tab remains fast as a Library grows.
CREATE INDEX IF NOT EXISTS idx_library_item_revision_source
  ON library_item ((metadata->>'sourceFileId'))
  WHERE deleted_at IS NULL;
