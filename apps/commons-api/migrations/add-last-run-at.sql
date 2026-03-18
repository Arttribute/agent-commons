-- Add missing last_run_at column to task table
-- This column tracks when a recurring task was last executed

ALTER TABLE task
ADD COLUMN IF NOT EXISTS last_run_at timestamp with time zone;

-- Verify the column was added
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'task'
AND column_name IN ('last_run_at', 'next_run_at', 'scheduled_for', 'cron_expression')
ORDER BY column_name;
