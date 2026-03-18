#!/usr/bin/env node
/**
 * Phase 1 Migration: Model Provider Support + Durable Scheduler
 *
 * Adds:
 *   - agent.model_provider, model_id, model_api_key, model_base_url
 *   - scheduled_task_run table (durable cron scheduling)
 *   - Performance indexes
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL);

async function columnExists(table, column) {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0;
}

async function tableExists(table) {
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = ${table}
  `;
  return rows.length > 0;
}

async function indexExists(name) {
  const rows = await sql`
    SELECT 1 FROM pg_indexes WHERE indexname = ${name}
  `;
  return rows.length > 0;
}

async function migrate() {
  console.log('Phase 1: Model Provider + Durable Scheduler migration\n');

  try {
    // ── 1. agent: model provider columns ────────────────────────────────────
    console.log('Step 1: agent model-provider columns...');

    if (!(await columnExists('agent', 'model_provider'))) {
      await sql`ALTER TABLE agent ADD COLUMN model_provider text NOT NULL DEFAULT 'openai'`;
      console.log('  + agent.model_provider');
    } else {
      console.log('  . agent.model_provider already exists');
    }

    if (!(await columnExists('agent', 'model_id'))) {
      await sql`ALTER TABLE agent ADD COLUMN model_id text NOT NULL DEFAULT 'gpt-4o'`;
      console.log('  + agent.model_id');
    } else {
      console.log('  . agent.model_id already exists');
    }

    if (!(await columnExists('agent', 'model_api_key'))) {
      await sql`ALTER TABLE agent ADD COLUMN model_api_key text`;
      console.log('  + agent.model_api_key');
    } else {
      console.log('  . agent.model_api_key already exists');
    }

    if (!(await columnExists('agent', 'model_base_url'))) {
      await sql`ALTER TABLE agent ADD COLUMN model_base_url text`;
      console.log('  + agent.model_base_url');
    } else {
      console.log('  . agent.model_base_url already exists');
    }

    // ── 2. scheduled_task_run table ─────────────────────────────────────────
    console.log('\nStep 2: scheduled_task_run table...');

    if (!(await tableExists('scheduled_task_run'))) {
      await sql`
        CREATE TABLE scheduled_task_run (
          run_id      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          task_id     uuid NOT NULL REFERENCES task(task_id) ON DELETE CASCADE,
          session_id  uuid REFERENCES session(session_id) ON DELETE SET NULL,
          status      text NOT NULL DEFAULT 'pending',
          triggered_by text NOT NULL DEFAULT 'cron',
          scheduled_for timestamptz NOT NULL,
          started_at  timestamptz,
          completed_at timestamptz,
          error_message text,
          created_at  timestamptz NOT NULL DEFAULT now()
        )
      `;
      console.log('  + scheduled_task_run created');
    } else {
      console.log('  . scheduled_task_run already exists');
    }

    // ── 3. Indexes ───────────────────────────────────────────────────────────
    console.log('\nStep 3: indexes...');

    if (!(await indexExists('idx_scheduled_task_run_due'))) {
      await sql`
        CREATE INDEX idx_scheduled_task_run_due
          ON scheduled_task_run (status, scheduled_for)
          WHERE status = 'pending'
      `;
      console.log('  + idx_scheduled_task_run_due');
    }

    if (!(await indexExists('idx_scheduled_task_run_task'))) {
      await sql`CREATE INDEX idx_scheduled_task_run_task ON scheduled_task_run (task_id)`;
      console.log('  + idx_scheduled_task_run_task');
    }

    if (!(await indexExists('idx_session_agent_created'))) {
      await sql`CREATE INDEX idx_session_agent_created ON session (agent_id, created_at DESC)`;
      console.log('  + idx_session_agent_created');
    }

    if (!(await indexExists('idx_task_status_priority'))) {
      await sql`CREATE INDEX idx_task_status_priority ON task (status, priority DESC, created_at ASC)`;
      console.log('  + idx_task_status_priority');
    }

    console.log('\nPhase 1 migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
