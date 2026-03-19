-- ================================================================
-- Agent Commons: Add missing columns to the workflow table
-- These columns are defined in schema.ts but were never in a
-- migration. Run this against your Supabase DB.
-- Idempotent — safe to run multiple times.
-- ================================================================

BEGIN;

ALTER TABLE workflow
  ADD COLUMN IF NOT EXISTS actual_output_schema jsonb,
  ADD COLUMN IF NOT EXISTS schema_locked        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS version              text DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS is_template          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active            boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS trigger_type         text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS trigger_config       jsonb,
  ADD COLUMN IF NOT EXISTS timeout_ms           integer DEFAULT 300000,
  ADD COLUMN IF NOT EXISTS execution_count      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_executed_at     timestamp with time zone;

COMMIT;

-- ─── VERIFICATION ────────────────────────────────────────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workflow'
  AND column_name IN ('actual_output_schema', 'schema_locked', 'version',
                      'is_template', 'is_active', 'trigger_type', 'trigger_config',
                      'timeout_ms', 'execution_count', 'success_count',
                      'failure_count', 'last_executed_at')
ORDER BY column_name;
