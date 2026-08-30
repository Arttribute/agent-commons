-- Artifacts are first-class provenance resources. A trace link identifies the
-- exact producing run without copying or denormalising the append-only EAA log.
ALTER TABLE library_link
  DROP CONSTRAINT IF EXISTS library_link_scope_type_check;

ALTER TABLE library_link
  ADD CONSTRAINT library_link_scope_type_check
  CHECK (scope_type IN ('session', 'code_project', 'agent', 'provenance_trace'));

-- Share capabilities carry an explicit, privacy-preserving disclosure policy.
-- Existing links retain their historical behaviour and include the artifact.
ALTER TABLE library_share_link
  ADD COLUMN IF NOT EXISTS disclosure jsonb NOT NULL DEFAULT
    '{"artifact":true,"provenance":true,"events":false}'::jsonb;

COMMENT ON COLUMN library_share_link.disclosure IS
  'Selective disclosure policy for the public artifact/provenance capability.';
