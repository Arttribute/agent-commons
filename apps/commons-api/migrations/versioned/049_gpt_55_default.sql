-- Existing personal copilots are updated through the authenticated agent API
-- after deployment, when the Free-plan authorization change is live.
ALTER TABLE agent ALTER COLUMN model_provider SET DEFAULT 'openai';
ALTER TABLE agent ALTER COLUMN model_id SET DEFAULT 'gpt-5.5';
