-- Recreates tool_execution_log to match models/schema.ts. The production
-- table was an older variant (execution_id / inputs / outputs / duration_ms)
-- that never matched the code, so every tool-execution log insert failed with
-- "column log_id does not exist" (caught and swallowed — logs were silently
-- lost). The table is empty in production, so dropping it is safe.

BEGIN;

-- uuid_generate_v4 lives in the extensions schema on Supabase
SET search_path = public, extensions;

DROP TABLE IF EXISTS tool_execution_log;

CREATE TABLE tool_execution_log (
  log_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  tool_id uuid NOT NULL REFERENCES tool(tool_id) ON DELETE CASCADE,

  -- Execution context
  agent_id text REFERENCES agent(agent_id) ON DELETE CASCADE,
  session_id uuid REFERENCES session(session_id) ON DELETE CASCADE,
  user_id text,

  -- Execution details
  status text NOT NULL,
  started_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  duration integer,

  -- Input/Output (sanitized - no sensitive data)
  input_args jsonb,
  output_data jsonb,
  error_message text,
  error_stack text,

  -- Key usage tracking (without exposing key value)
  key_id uuid REFERENCES tool_key(key_id) ON DELETE SET NULL,

  -- Rate limiting tracking
  rate_limit_hit boolean DEFAULT false,

  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_tool_execution_log_tool
  ON tool_execution_log(tool_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_execution_log_agent
  ON tool_execution_log(agent_id, started_at DESC);

COMMIT;
