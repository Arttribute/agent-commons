-- Human-approval nodes pause a workflow durably until an authenticated
-- reviewer approves or rejects it. Keep the database constraint aligned with
-- the execution state machine; older databases only allowed terminal/running
-- states and rejected the pause transition.
ALTER TABLE workflow_execution
  DROP CONSTRAINT IF EXISTS workflow_execution_status_check;

ALTER TABLE workflow_execution
  ADD CONSTRAINT workflow_execution_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'running'::text,
        'completed'::text,
        'failed'::text,
        'cancelled'::text,
        'awaiting_approval'::text
      ]
    )
  );

COMMENT ON COLUMN workflow_execution.status IS
  'Workflow state: pending, running, awaiting_approval, completed, failed, or cancelled.';
