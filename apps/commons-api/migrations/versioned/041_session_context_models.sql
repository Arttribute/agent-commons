-- Preserve agent media defaults and explicit knowledge selection across sessions.
ALTER TABLE agent ADD COLUMN IF NOT EXISTS media_models jsonb DEFAULT '{}'::jsonb;
ALTER TABLE session ADD COLUMN IF NOT EXISTS run_context jsonb DEFAULT '{}'::jsonb;
