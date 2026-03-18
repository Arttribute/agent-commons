/**
 * Phase 7 — Performance Indexes
 *
 * Adds indexes on the hottest query paths to eliminate full-table scans:
 *   - workflow_execution(workflow_id, status)   — list active executions per workflow
 *   - workflow_execution(agent_id, status)      — list executions by agent
 *   - task(agent_id, status)                    — task queue queries per agent
 *   - task(session_id)                          — load tasks for a session
 *   - task(created_at)                          — ordered task listings
 *   - task(next_run_at) WHERE is_recurring      — scheduler: find tasks due to run
 *   - session(agent_id)                         — list sessions per agent
 *   - tool(owner)                               — list tools per owner
 *   - scheduled_task_run(task_id, status)       — scheduler deduplication
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL);

async function indexExists(name) {
  const rows = await sql`SELECT 1 FROM pg_indexes WHERE indexname = ${name}`;
  return rows.length > 0;
}

async function migrate() {
  console.log('Phase 7: Performance Indexes migration\n');

  try {
    const indexes = [
      // workflow_execution
      ['idx_workflow_execution_workflow_status',
        `CREATE INDEX idx_workflow_execution_workflow_status ON workflow_execution (workflow_id, status)`],
      ['idx_workflow_execution_agent_status',
        `CREATE INDEX idx_workflow_execution_agent_status ON workflow_execution (agent_id, status) WHERE agent_id IS NOT NULL`],
      // task
      ['idx_task_agent_status',
        `CREATE INDEX idx_task_agent_status ON task (agent_id, status)`],
      ['idx_task_session_id',
        `CREATE INDEX idx_task_session_id ON task (session_id) WHERE session_id IS NOT NULL`],
      ['idx_task_created_at',
        `CREATE INDEX idx_task_created_at ON task (created_at DESC)`],
      ['idx_task_next_run_recurring',
        `CREATE INDEX idx_task_next_run_recurring ON task (next_run_at ASC) WHERE is_recurring = true AND status != 'cancelled'`],
      // session
      ['idx_session_agent_id',
        `CREATE INDEX idx_session_agent_id ON session (agent_id)`],
      // tool
      ['idx_tool_owner',
        `CREATE INDEX idx_tool_owner ON tool (owner) WHERE owner IS NOT NULL`],
      // scheduled_task_run
      ['idx_scheduled_task_run_task_status',
        `CREATE INDEX idx_scheduled_task_run_task_status ON scheduled_task_run (task_id, status)`],
    ];

    for (const [name, ddl] of indexes) {
      if (!(await indexExists(name))) {
        await sql.unsafe(ddl);
        console.log(`  + ${name}`);
      } else {
        console.log(`  . ${name} already exists`);
      }
    }

    console.log('\nPhase 7 migration complete.\n');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
