#!/usr/bin/env node
/**
 * Phase 8 Migration: Observability & Cost Tracking
 *
 * Adds:
 *   - usage_event table — one row per LLM call, tracks token counts + cost
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL);

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
  console.log('Phase 8: Observability & Cost Tracking migration\n');

  try {
    // ── 1. usage_event table ────────────────────────────────────────────────
    console.log('Step 1: usage_event table...');

    if (!(await tableExists('usage_event'))) {
      await sql`
        CREATE TABLE usage_event (
          event_id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          agent_id              text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
          session_id            uuid REFERENCES session(session_id) ON DELETE SET NULL,
          task_id               uuid REFERENCES task(task_id) ON DELETE SET NULL,
          workflow_execution_id uuid REFERENCES workflow_execution(execution_id) ON DELETE SET NULL,

          -- Model information
          provider              text NOT NULL,   -- 'openai' | 'anthropic' | 'google' | ...
          model_id              text NOT NULL,   -- e.g. 'gpt-4o', 'claude-sonnet-4-6'

          -- Token usage
          input_tokens          integer NOT NULL DEFAULT 0,
          output_tokens         integer NOT NULL DEFAULT 0,
          cached_tokens         integer NOT NULL DEFAULT 0,
          total_tokens          integer NOT NULL DEFAULT 0,

          -- Cost (USD)
          cost_usd              real NOT NULL DEFAULT 0,

          -- BYOK flag — true if the user supplied their own API key
          is_byok               boolean NOT NULL DEFAULT false,

          -- Run duration in milliseconds
          duration_ms           integer,

          created_at            timestamptz NOT NULL DEFAULT timezone('utc', now())
        )
      `;
      console.log('  + usage_event table created');
    } else {
      console.log('  . usage_event already exists');
    }

    // ── 2. Indexes ───────────────────────────────────────────────────────────
    console.log('\nStep 2: indexes...');

    if (!(await indexExists('idx_usage_event_agent_id'))) {
      await sql`CREATE INDEX idx_usage_event_agent_id ON usage_event (agent_id)`;
      console.log('  + idx_usage_event_agent_id');
    } else {
      console.log('  . idx_usage_event_agent_id already exists');
    }

    if (!(await indexExists('idx_usage_event_session_id'))) {
      await sql`CREATE INDEX idx_usage_event_session_id ON usage_event (session_id)`;
      console.log('  + idx_usage_event_session_id');
    } else {
      console.log('  . idx_usage_event_session_id already exists');
    }

    if (!(await indexExists('idx_usage_event_created_at'))) {
      await sql`CREATE INDEX idx_usage_event_created_at ON usage_event (created_at DESC)`;
      console.log('  + idx_usage_event_created_at');
    } else {
      console.log('  . idx_usage_event_created_at already exists');
    }

    console.log('\nPhase 8 migration complete.\n');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
