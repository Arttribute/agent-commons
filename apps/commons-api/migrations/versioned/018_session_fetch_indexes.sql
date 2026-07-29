-- Session sidebars and dashboards filter by owner and sort by recent activity.
-- Keep these covering prefixes aligned with SessionService list queries so the
-- API never has to scan or sort the JSONB history payloads.
CREATE INDEX IF NOT EXISTS idx_session_initiator_updated
  ON session (initiator, updated_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_agent_initiator_updated
  ON session (agent_id, initiator, updated_at DESC, created_at DESC);
