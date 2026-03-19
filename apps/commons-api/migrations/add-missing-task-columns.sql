-- ================================================================
-- Agent Commons: Add missing columns to the task table and create
-- the scheduled_task_run table.
-- These are defined in schema.ts but were never in a migration.
-- Run this against your Supabase DB.
-- Idempotent — safe to run multiple times.
-- ================================================================

BEGIN;

-- ─── TASK TABLE ──────────────────────────────────────────────────────────────

ALTER TABLE task
  ADD COLUMN IF NOT EXISTS context     jsonb,
  ADD COLUMN IF NOT EXISTS tools       jsonb,
  ADD COLUMN IF NOT EXISTS timeout_ms  integer;

-- ─── SCHEDULED TASK RUN TABLE ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scheduled_task_run (
  run_id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id        uuid NOT NULL REFERENCES task(task_id) ON DELETE CASCADE,
  scheduled_for  timestamp with time zone NOT NULL,
  triggered_by   text NOT NULL DEFAULT 'cron',   -- 'cron' | 'manual' | 'dependency'
  status         text NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at     timestamp with time zone,
  completed_at   timestamp with time zone,
  error_message  text,
  session_id     uuid,
  created_at     timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_scheduled_task_run_pending
  ON scheduled_task_run (scheduled_for, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_task_run_task
  ON scheduled_task_run (task_id);

COMMIT;

-- ─── VERIFICATION ────────────────────────────────────────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'task'
  AND column_name IN ('context', 'tools', 'timeout_ms')
ORDER BY column_name;

SELECT table_name FROM information_schema.tables
WHERE table_name = 'scheduled_task_run';
