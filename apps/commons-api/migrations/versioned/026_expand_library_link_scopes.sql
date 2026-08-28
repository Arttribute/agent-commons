-- Agent-generated artifacts are grouped by their producing agent as well as
-- their session. The original constraint predated agent-scoped library views.
ALTER TABLE library_link
  DROP CONSTRAINT IF EXISTS library_link_scope_type_check;

ALTER TABLE library_link
  ADD CONSTRAINT library_link_scope_type_check
  CHECK (scope_type IN ('session', 'code_project', 'agent'));
