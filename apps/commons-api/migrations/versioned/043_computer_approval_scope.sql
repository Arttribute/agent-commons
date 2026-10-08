-- Resource approvals use the existing owner-reviewed proposal table.
ALTER TABLE copilot_change
  DROP CONSTRAINT IF EXISTS copilot_change_scope_check;

ALTER TABLE copilot_change
  ADD CONSTRAINT copilot_change_scope_check
  CHECK (scope IN ('agents', 'tools', 'skills', 'tasks', 'workflows', 'account', 'computers'));
