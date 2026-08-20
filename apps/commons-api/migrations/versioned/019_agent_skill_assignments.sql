CREATE TABLE IF NOT EXISTS agent_skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES skill(skill_id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  assigned_by text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_skill_agent_skill
  ON agent_skill (agent_id, skill_id);

CREATE INDEX IF NOT EXISTS idx_agent_skill_skill
  ON agent_skill (skill_id, agent_id);

-- Preserve existing agent-owned skills as explicit assignments.
INSERT INTO agent_skill (agent_id, skill_id, assigned_by)
SELECT a.agent_id, s.skill_id, COALESCE(a.owner_user_id, a.owner)
FROM skill s
INNER JOIN agent a ON a.agent_id = s.owner_id
WHERE s.owner_type = 'agent'
ON CONFLICT (agent_id, skill_id) DO NOTHING;

-- Bundled Commons skills start on each account's Commons Copilot. Other
-- agents receive them only when the user explicitly enables them.
INSERT INTO agent_skill (agent_id, skill_id, assigned_by)
SELECT a.agent_id, s.skill_id, COALESCE(a.owner_user_id, a.owner)
FROM agent a
CROSS JOIN skill s
WHERE a.is_default = true
  AND a.is_system_managed = true
  AND s.owner_type = 'platform'
  AND s.is_active = true
ON CONFLICT (agent_id, skill_id) DO NOTHING;
