#!/usr/bin/env node
/**
 * Phase 4 Migration: A2A Protocol + MCP HTTP Transport
 *
 * Adds:
 *   - a2a_task table  — stores inbound A2A tasks with full lifecycle
 *   - a2a_message table — stores A2A message parts per task
 *   - mcp_server: support for 'http' connectionType (column comment only)
 *   - agent.a2a_enabled, agent.a2a_skills columns
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
  const rows = await sql`SELECT 1 FROM pg_indexes WHERE indexname = ${name}`;
  return rows.length > 0;
}

async function migrate() {
  console.log('Phase 4: A2A Protocol + MCP HTTP Transport migration\n');

  try {
    // ── 1. agent: A2A columns ────────────────────────────────────────────────
    console.log('Step 1: agent A2A columns...');

    if (!(await columnExists('agent', 'a2a_enabled'))) {
      await sql`ALTER TABLE agent ADD COLUMN a2a_enabled boolean NOT NULL DEFAULT false`;
      console.log('  + agent.a2a_enabled');
    } else {
      console.log('  . agent.a2a_enabled already exists');
    }

    if (!(await columnExists('agent', 'a2a_skills'))) {
      await sql`ALTER TABLE agent ADD COLUMN a2a_skills jsonb`;
      console.log('  + agent.a2a_skills');
    } else {
      console.log('  . agent.a2a_skills already exists');
    }

    // ── 2. a2a_task table ────────────────────────────────────────────────────
    console.log('\nStep 2: a2a_task table...');

    if (!(await tableExists('a2a_task'))) {
      await sql`
        CREATE TABLE a2a_task (
          task_id         text PRIMARY KEY DEFAULT uuid_generate_v4()::text,
          agent_id        text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
          session_id      uuid REFERENCES session(session_id) ON DELETE SET NULL,

          -- A2A task state machine: submitted | working | input-required | completed | failed | canceled
          state           text NOT NULL DEFAULT 'submitted',

          -- Caller identity (external agent/client that sent this task)
          caller_id       text,
          caller_url      text,

          -- The inbound message (serialised A2A Message JSON)
          input_message   jsonb NOT NULL,

          -- A2A session-level context id (groups related tasks)
          context_id      text,

          -- Output messages and artefacts
          output_messages jsonb,   -- A2A Message[]
          artifacts       jsonb,   -- A2A Artifact[]

          -- Webhook / push notification config
          push_url        text,
          push_token      text,

          error           jsonb,   -- A2A TaskError

          created_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
          updated_at      timestamptz NOT NULL DEFAULT timezone('utc', now()),
          completed_at    timestamptz
        )
      `;
      console.log('  + a2a_task created');
    } else {
      console.log('  . a2a_task already exists');
    }

    // ── 3. Indexes ───────────────────────────────────────────────────────────
    console.log('\nStep 3: indexes...');

    if (!(await indexExists('idx_a2a_task_agent'))) {
      await sql`CREATE INDEX idx_a2a_task_agent ON a2a_task (agent_id, created_at DESC)`;
      console.log('  + idx_a2a_task_agent');
    }

    if (!(await indexExists('idx_a2a_task_state'))) {
      await sql`CREATE INDEX idx_a2a_task_state ON a2a_task (state) WHERE state IN ('submitted','working','input-required')`;
      console.log('  + idx_a2a_task_state');
    }

    if (!(await indexExists('idx_a2a_task_context'))) {
      await sql`CREATE INDEX idx_a2a_task_context ON a2a_task (context_id) WHERE context_id IS NOT NULL`;
      console.log('  + idx_a2a_task_context');
    }

    console.log('\nPhase 4 migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
