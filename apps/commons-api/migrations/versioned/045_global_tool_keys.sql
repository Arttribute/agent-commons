-- ToolKeyService and its API support owner-level credentials without a tool.
-- The baseline predates that API and still requires tool_id, rejecting every
-- owner-level insert. Retain existing foreign keys and scoped uniqueness.
ALTER TABLE tool_key ALTER COLUMN tool_id DROP NOT NULL;
