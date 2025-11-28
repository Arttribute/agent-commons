-- ========================================
-- Agent Commons: Tools → Workflows → Tasks
-- Supabase Schema Sync Migration
-- ========================================

BEGIN;

-- ========================================
-- 1. CREATE NEW TABLES
-- ========================================

-- Tool Key Management
CREATE TABLE IF NOT EXISTS tool_key (
  key_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id uuid NOT NULL REFERENCES tool(tool_id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('platform', 'user', 'agent')),
  encrypted_value text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(tool_id, owner_id, owner_type)
);

CREATE INDEX IF NOT EXISTS idx_tool_key_lookup ON tool_key(tool_id, owner_id, owner_type, is_active);

-- Tool Permissions
CREATE TABLE IF NOT EXISTS tool_permission (
  permission_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id uuid NOT NULL REFERENCES tool(tool_id) ON DELETE CASCADE,
  granted_to_id text NOT NULL,
  granted_to_type text NOT NULL CHECK (granted_to_type IN ('user', 'agent')),
  granted_by_id text NOT NULL,
  granted_by_type text NOT NULL CHECK (granted_by_type IN ('user', 'agent')),
  granted_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  revoked_at timestamp with time zone,
  UNIQUE(tool_id, granted_to_id, granted_to_type)
);

CREATE INDEX IF NOT EXISTS idx_tool_permission_lookup ON tool_permission(tool_id, granted_to_id, granted_to_type)
  WHERE revoked_at IS NULL;

-- Tool Execution Log
CREATE TABLE IF NOT EXISTS tool_execution_log (
  execution_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id uuid NOT NULL REFERENCES tool(tool_id),
  agent_id text,
  session_id text,
  workflow_execution_id uuid,
  task_id uuid,
  inputs jsonb NOT NULL,
  outputs jsonb,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error text,
  started_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamp with time zone,
  duration_ms integer
);

CREATE INDEX IF NOT EXISTS idx_tool_execution_tool ON tool_execution_log(tool_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_execution_agent ON tool_execution_log(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_execution_workflow ON tool_execution_log(workflow_execution_id);
CREATE INDEX IF NOT EXISTS idx_tool_execution_task ON tool_execution_log(task_id);

-- Workflow Definition
CREATE TABLE IF NOT EXISTS workflow (
  workflow_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  owner_id text NOT NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('user', 'agent')),
  definition jsonb NOT NULL,
  input_schema jsonb,
  output_schema jsonb,
  is_public boolean NOT NULL DEFAULT false,
  category text,
  tags jsonb,
  usage_count integer NOT NULL DEFAULT 0,
  fork_count integer NOT NULL DEFAULT 0,
  forked_from_id uuid REFERENCES workflow(workflow_id),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_workflow_owner ON workflow(owner_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_workflow_public ON workflow(is_public, category);
CREATE INDEX IF NOT EXISTS idx_workflow_forked_from ON workflow(forked_from_id);

-- Workflow Execution
CREATE TABLE IF NOT EXISTS workflow_execution (
  execution_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id uuid NOT NULL REFERENCES workflow(workflow_id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  session_id text,
  task_id uuid,
  input_data jsonb NOT NULL,
  output_data jsonb,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  current_node text,
  error text,
  started_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamp with time zone,
  user_id text
);

CREATE INDEX IF NOT EXISTS idx_workflow_execution_workflow ON workflow_execution(workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_agent ON workflow_execution(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_task ON workflow_execution(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_status ON workflow_execution(status, started_at DESC);

-- Workflow Execution Nodes
CREATE TABLE IF NOT EXISTS workflow_execution_node (
  node_execution_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id uuid NOT NULL REFERENCES workflow_execution(execution_id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('tool', 'agent_processor', 'input', 'output')),
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  input_data jsonb,
  output_data jsonb,
  error text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_workflow_execution_node_execution ON workflow_execution_node(execution_id, node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_node_status ON workflow_execution_node(execution_id, status);

-- ========================================
-- 2. UPDATE EXISTING TABLES
-- ========================================

-- Update tool table with input/output schemas
ALTER TABLE tool
  ADD COLUMN IF NOT EXISTS input_schema jsonb,
  ADD COLUMN IF NOT EXISTS output_schema jsonb,
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'platform' CHECK (visibility IN ('platform', 'public', 'private')),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc', now());

-- Update task table for workflow support
ALTER TABLE task
  ADD COLUMN IF NOT EXISTS execution_mode text DEFAULT 'single' CHECK (execution_mode IN ('single', 'workflow', 'sequential')),
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES workflow(workflow_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_inputs jsonb,
  ADD COLUMN IF NOT EXISTS workflow_outputs jsonb,
  ADD COLUMN IF NOT EXISTS cron_expression text,
  ADD COLUMN IF NOT EXISTS depends_on text[],
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS created_by_type text CHECK (created_by_type IN ('user', 'agent'));

-- Create index for cron tasks
CREATE INDEX IF NOT EXISTS idx_task_cron ON task(cron_expression, status)
  WHERE cron_expression IS NOT NULL AND is_recurring = true;

-- Create index for workflow tasks
CREATE INDEX IF NOT EXISTS idx_task_workflow ON task(workflow_id, status)
  WHERE workflow_id IS NOT NULL;

-- Create index for dependency resolution
CREATE INDEX IF NOT EXISTS idx_task_depends_on ON task USING GIN(depends_on)
  WHERE depends_on IS NOT NULL;

-- ========================================
-- 3. DATA MIGRATION
-- ========================================

-- Migrate existing tasks to have created_by information
UPDATE task
SET
  created_by = agent_id,
  created_by_type = 'agent'
WHERE created_by IS NULL AND agent_id IS NOT NULL;

-- Set default execution mode for existing tasks
UPDATE task
SET execution_mode = 'single'
WHERE execution_mode IS NULL;

-- ========================================
-- 4. DEPRECATED TABLES (Mark for removal)
-- ========================================

-- These tables are deprecated but not dropped yet
-- to allow for data migration if needed:
-- - goal (superseded by tasks)
-- - task_dependency (superseded by depends_on array)

-- You can manually drop these after verifying data migration:
-- DROP TABLE IF EXISTS task_dependency;
-- DROP TABLE IF EXISTS goal;

-- ========================================
-- 5. CREATE UPDATE TRIGGERS
-- ========================================

-- Update trigger for tool table
CREATE OR REPLACE FUNCTION update_tool_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tool_updated_at ON tool;
CREATE TRIGGER tool_updated_at
  BEFORE UPDATE ON tool
  FOR EACH ROW
  EXECUTE FUNCTION update_tool_timestamp();

-- Update trigger for tool_key table
CREATE OR REPLACE FUNCTION update_tool_key_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tool_key_updated_at ON tool_key;
CREATE TRIGGER tool_key_updated_at
  BEFORE UPDATE ON tool_key
  FOR EACH ROW
  EXECUTE FUNCTION update_tool_key_timestamp();

-- Update trigger for workflow table
CREATE OR REPLACE FUNCTION update_workflow_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflow_updated_at ON workflow;
CREATE TRIGGER workflow_updated_at
  BEFORE UPDATE ON workflow
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_timestamp();

COMMIT;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Check new tables
SELECT 'New tables created:' as message;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('workflow', 'workflow_execution', 'workflow_execution_node',
                     'tool_key', 'tool_permission', 'tool_execution_log')
ORDER BY table_name;

-- Check task table columns
SELECT 'Task table columns:' as message;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'task'
  AND column_name IN ('execution_mode', 'workflow_id', 'workflow_inputs',
                      'cron_expression', 'depends_on', 'created_by', 'created_by_type')
ORDER BY column_name;

-- Check tool table columns
SELECT 'Tool table columns:' as message;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tool'
  AND column_name IN ('input_schema', 'output_schema', 'visibility', 'updated_at')
ORDER BY column_name;
