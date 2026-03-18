import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const dbUrl = process.env.DATABASE_URL ||
  `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`;

const sql = postgres(dbUrl);

async function fixColumns() {
  console.log('🔍 Comprehensively fixing all database schema mismatches...\n');

  try {
    // ========== TASK TABLE ==========
    console.log('📋 Fixing task table columns...');

    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS execution_mode text DEFAULT 'single'`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS workflow_id uuid`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS workflow_inputs jsonb`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS cron_expression text`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS scheduled_for timestamp with time zone`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS next_run_at timestamp with time zone`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS last_run_at timestamp with time zone`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS actual_start timestamp with time zone`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS actual_end timestamp with time zone`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS estimated_duration integer`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS depends_on jsonb`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS tools jsonb`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS context jsonb`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS result_content jsonb`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS summary text`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS error_message text`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS created_by text`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS created_by_type text`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone`;
    await sql`ALTER TABLE task ADD COLUMN IF NOT EXISTS progress real DEFAULT 0`;

    // Add foreign key constraint for workflow_id if not exists
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'task_workflow_id_fkey'
        ) THEN
          ALTER TABLE task
          ADD CONSTRAINT task_workflow_id_fkey
          FOREIGN KEY (workflow_id)
          REFERENCES workflow(workflow_id)
          ON DELETE SET NULL;
        END IF;
      END $$;
    `;

    console.log('  ✅ Task table updated');

    // ========== WORKFLOW_EXECUTION TABLE ==========
    console.log('📋 Fixing workflow_execution table columns...');

    await sql`ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS current_node text`;
    await sql`ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS started_at timestamp with time zone`;
    await sql`ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone`;
    await sql`ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS input_data jsonb`;
    await sql`ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS output_data jsonb`;
    await sql`ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS node_results jsonb`;
    await sql`ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS error_message text`;

    console.log('  ✅ Workflow execution table updated');

    // ========== TOOL TABLE ==========
    console.log('📋 Fixing tool table columns...');

    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS display_name text`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS api_spec jsonb`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS input_schema jsonb`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS output_schema jsonb`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS category text`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS tags jsonb`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS icon text`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS version text DEFAULT '1.0.0'`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS is_deprecated boolean DEFAULT false`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS execution_count integer DEFAULT 0`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS last_executed_at timestamp with time zone`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer`;
    await sql`ALTER TABLE tool ADD COLUMN IF NOT EXISTS rate_limit_per_hour integer`;

    console.log('  ✅ Tool table updated');

    // ========== TOOL_KEY TABLE ==========
    console.log('📋 Fixing tool_key table columns...');

    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS key_name text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS display_name text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS encrypted_value text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS encryption_iv text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS encryption_tag text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS owner_id text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS owner_type text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS key_type text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS masked_value text`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone`;

    console.log('  ✅ Tool key table updated');

    // ========== WORKFLOW TABLE ==========
    console.log('📋 Fixing workflow table columns...');

    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS actual_output_schema jsonb`;
    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS schema_locked boolean DEFAULT false`;
    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS is_template boolean DEFAULT false`;
    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS trigger_type text DEFAULT 'manual'`;
    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS trigger_config jsonb`;
    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS execution_count integer DEFAULT 0`;
    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS success_count integer DEFAULT 0`;
    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS failure_count integer DEFAULT 0`;
    await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS last_executed_at timestamp with time zone`;

    console.log('  ✅ Workflow table updated');

    // ========== VERIFY ALL TABLES ==========
    console.log('\n📊 Verifying all table schemas...\n');

    const tables = [
      { name: 'task', expectedMinCols: 30 },
      { name: 'workflow', expectedMinCols: 15 },
      { name: 'workflow_execution', expectedMinCols: 10 },
      { name: 'tool', expectedMinCols: 14 },
      { name: 'tool_key', expectedMinCols: 10 },
      { name: 'tool_permission', expectedMinCols: 6 },
      { name: 'tool_key_mapping', expectedMinCols: 5 },
      { name: 'tool_execution_log', expectedMinCols: 10 },
    ];

    for (const table of tables) {
      const cols = await sql`
        SELECT COUNT(*) as count
        FROM information_schema.columns
        WHERE table_name = ${table.name}
      `;
      const count = parseInt(cols[0].count);
      const status = count >= table.expectedMinCols ? '✅' : '⚠️';
      console.log(`  ${status} ${table.name}: ${count} columns (expected min: ${table.expectedMinCols})`);
    }

    // ========== VERIFY CRITICAL COLUMNS ==========
    console.log('\n🔍 Verifying critical columns exist...\n');

    const criticalColumns = [
      { table: 'task', column: 'error_message' },
      { table: 'task', column: 'scheduled_for' },
      { table: 'task', column: 'next_run_at' },
      { table: 'task', column: 'last_run_at' },
      { table: 'task', column: 'execution_mode' },
      { table: 'task', column: 'workflow_id' },
      { table: 'task', column: 'created_by' },
      { table: 'task', column: 'created_by_type' },
      { table: 'task', column: 'completed_at' },
      { table: 'task', column: 'progress' },
      { table: 'workflow_execution', column: 'error_message' },
      { table: 'workflow_execution', column: 'node_results' },
      { table: 'workflow_execution', column: 'current_node' },
      { table: 'tool', column: 'api_spec' },
      { table: 'tool', column: 'input_schema' },
      { table: 'tool', column: 'output_schema' },
    ];

    for (const { table, column } of criticalColumns) {
      const result = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = ${table}
        AND column_name = ${column}
      `;

      if (result.length > 0) {
        console.log(`  ✅ ${table}.${column} (${result[0].data_type})`);
      } else {
        console.log(`  ❌ ${table}.${column} MISSING!`);
      }
    }

    console.log('\n✅ All schema fixes applied successfully!\n');

  } catch (error) {
    console.error('❌ Error fixing columns:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

fixColumns().catch(console.error);
