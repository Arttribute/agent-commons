-- Attribute copilot proposals to the session they came from so the UI can
-- surface "needs review" indicators on specific copilot chats.
ALTER TABLE copilot_change
  ADD COLUMN IF NOT EXISTS session_id uuid;

CREATE INDEX IF NOT EXISTS copilot_change_session_idx
  ON copilot_change (session_id, status);
