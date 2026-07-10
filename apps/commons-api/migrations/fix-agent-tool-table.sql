-- Aligns the agent_tool table with models/schema.ts. The production table had
-- drifted: a legacy camelCase "toolId" column, tool_id as text instead of
-- uuid, and no is_enabled / config / updated_at columns — so inserts with
-- RETURNING failed with "column is_enabled does not exist" (surfaced as a 500
-- when connecting a tool to an agent in Studio).
--
-- The table is empty in production, so the type conversion is safe. This
-- script is idempotent.

BEGIN;

ALTER TABLE agent_tool DROP COLUMN IF EXISTS "toolId";

ALTER TABLE agent_tool
  ADD COLUMN IF NOT EXISTS usage_comments text,
  ADD COLUMN IF NOT EXISTS is_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS config jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE agent_tool
  ALTER COLUMN tool_id TYPE uuid USING tool_id::uuid,
  ALTER COLUMN tool_id SET NOT NULL,
  ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE agent_tool DROP CONSTRAINT IF EXISTS agent_tool_agent_id_fkey;
ALTER TABLE agent_tool
  ADD CONSTRAINT agent_tool_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES agent(agent_id) ON DELETE CASCADE;

ALTER TABLE agent_tool DROP CONSTRAINT IF EXISTS agent_tool_tool_id_fkey;
ALTER TABLE agent_tool
  ADD CONSTRAINT agent_tool_tool_id_fkey
    FOREIGN KEY (tool_id) REFERENCES tool(tool_id) ON DELETE CASCADE;

-- One assignment per agent per tool: lets the API upsert on re-enable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tool_agent_tool
  ON agent_tool(agent_id, tool_id);

COMMIT;
