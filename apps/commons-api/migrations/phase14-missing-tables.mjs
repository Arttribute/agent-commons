#!/usr/bin/env node
/**
 * Phase 14 Migration: Missing Tables & Columns
 *
 * Creates:
 *   - agent_log          — per-agent activity logs
 *   - agent_preferred_connection — A2A preferred agent connections
 *   - resource           — knowledgebase / embedding resources
 *   - a2a_task           — A2A protocol task records (idempotent)
 *
 * Alters:
 *   - agent              — a2a_enabled, a2a_skills, a2a_endpoint
 *   - session            — initiator_type
 *   - api_keys           — key_prefix
 *   - tool               — display_name, api_spec, owner, owner_type, etc.
 *   - usage_event        — session_id, input/output/total tokens, cost_usd, model columns
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
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return rows.length > 0;
}

async function columnExists(table, column) {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0;
}

async function indexExists(name) {
  const rows = await sql`SELECT 1 FROM pg_indexes WHERE indexname = ${name}`;
  return rows.length > 0;
}

async function migrate() {
  console.log('Phase 14: Missing Tables & Columns migration\n');

  try {
    // ── 1. agent_log ────────────────────────────────────────────────────────
    console.log('Step 1: agent_log table...');
    if (!(await tableExists('agent_log'))) {
      await sql`
        CREATE TABLE agent_log (
          log_id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          agent_id      text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
          session_id    uuid REFERENCES session(session_id) ON DELETE CASCADE,
          action        text,
          message       text,
          status        text,
          response_time integer,
          tools         jsonb,
          created_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
        )
      `;
      console.log('  + agent_log created');
    } else {
      console.log('  . agent_log already exists');
    }

    if (!(await indexExists('idx_agent_log_agent_id'))) {
      await sql`CREATE INDEX idx_agent_log_agent_id ON agent_log (agent_id)`;
      console.log('  + idx_agent_log_agent_id');
    }
    if (!(await indexExists('idx_agent_log_session_id'))) {
      await sql`CREATE INDEX idx_agent_log_session_id ON agent_log (session_id)`;
      console.log('  + idx_agent_log_session_id');
    }
    if (!(await indexExists('idx_agent_log_created_at'))) {
      await sql`CREATE INDEX idx_agent_log_created_at ON agent_log (agent_id, created_at DESC)`;
      console.log('  + idx_agent_log_created_at');
    }

    // ── 2. agent_preferred_connection ───────────────────────────────────────
    console.log('\nStep 2: agent_preferred_connection table...');
    if (!(await tableExists('agent_preferred_connection'))) {
      await sql`
        CREATE TABLE agent_preferred_connection (
          id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          agent_id           text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
          preferred_agent_id text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
          usage_comments     text,
          created_at         timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
          UNIQUE (agent_id, preferred_agent_id)
        )
      `;
      console.log('  + agent_preferred_connection created');
    } else {
      console.log('  . agent_preferred_connection already exists');
    }

    if (!(await indexExists('idx_agent_preferred_connection_agent_id'))) {
      await sql`CREATE INDEX idx_agent_preferred_connection_agent_id ON agent_preferred_connection (agent_id)`;
      console.log('  + idx_agent_preferred_connection_agent_id');
    }

    // ── 3. resource ─────────────────────────────────────────────────────────
    console.log('\nStep 3: resource table...');
    if (!(await tableExists('resource'))) {
      await sql`
        CREATE TABLE resource (
          resource_id   text PRIMARY KEY DEFAULT uuid_generate_v4()::text,
          resource_type text NOT NULL,
          schema        jsonb NOT NULL DEFAULT '{}',
          tags          jsonb NOT NULL DEFAULT '[]',
          resource_file text NOT NULL DEFAULT '',
          created_at    timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
        )
      `;
      console.log('  + resource created');
    } else {
      console.log('  . resource already exists');
    }

    if (!(await indexExists('idx_resource_type'))) {
      await sql`CREATE INDEX idx_resource_type ON resource (resource_type)`;
      console.log('  + idx_resource_type');
    }

    // ── 4. a2a_task ─────────────────────────────────────────────────────────
    console.log('\nStep 4: a2a_task table...');
    if (!(await tableExists('a2a_task'))) {
      await sql`
        CREATE TABLE a2a_task (
          task_id         text PRIMARY KEY DEFAULT uuid_generate_v4()::text,
          agent_id        text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
          session_id      uuid REFERENCES session(session_id) ON DELETE SET NULL,
          state           text NOT NULL DEFAULT 'submitted',
          caller_id       text,
          caller_url      text,
          context_id      text,
          input_message   jsonb NOT NULL DEFAULT '{}',
          output_messages jsonb,
          artifacts       jsonb,
          push_url        text,
          push_token      text,
          error           jsonb,
          created_at      timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
          updated_at      timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
          completed_at    timestamp with time zone
        )
      `;
      console.log('  + a2a_task created');
    } else {
      console.log('  . a2a_task already exists');
    }

    if (!(await indexExists('idx_a2a_task_agent_id'))) {
      await sql`CREATE INDEX idx_a2a_task_agent_id ON a2a_task (agent_id)`;
      console.log('  + idx_a2a_task_agent_id');
    }
    if (!(await indexExists('idx_a2a_task_state'))) {
      await sql`CREATE INDEX idx_a2a_task_state ON a2a_task (state)`;
      console.log('  + idx_a2a_task_state');
    }

    // ── 5. agent columns ─────────────────────────────────────────────────────
    console.log('\nStep 5: agent A2A columns...');
    for (const [col, def] of [
      ['a2a_enabled',  'boolean NOT NULL DEFAULT false'],
      ['a2a_skills',   'jsonb'],
      ['a2a_endpoint', 'text'],
    ]) {
      if (!(await columnExists('agent', col))) {
        await sql.unsafe(`ALTER TABLE agent ADD COLUMN ${col} ${def}`);
        console.log(`  + agent.${col}`);
      } else {
        console.log(`  . agent.${col} already exists`);
      }
    }

    // ── 6. session.initiator_type ────────────────────────────────────────────
    console.log('\nStep 6: session.initiator_type...');
    if (!(await columnExists('session', 'initiator_type'))) {
      await sql`ALTER TABLE session ADD COLUMN initiator_type text DEFAULT 'web'`;
      console.log('  + session.initiator_type');
    } else {
      console.log('  . session.initiator_type already exists');
    }

    // ── 7. api_keys.key_prefix ───────────────────────────────────────────────
    console.log('\nStep 7: api_keys.key_prefix...');
    if (await tableExists('api_keys')) {
      if (!(await columnExists('api_keys', 'key_prefix'))) {
        await sql`ALTER TABLE api_keys ADD COLUMN key_prefix text`;
        console.log('  + api_keys.key_prefix');
      } else {
        console.log('  . api_keys.key_prefix already exists');
      }
    } else {
      console.log('  ! api_keys table not found — skipping');
    }

    // ── 8. tool columns ──────────────────────────────────────────────────────
    console.log('\nStep 8: tool table columns...');
    const toolCols = [
      ['display_name',          'text'],
      ['api_spec',              'jsonb'],
      ['input_schema',          'jsonb'],
      ['output_schema',         'jsonb'],
      ['owner',                 'text'],
      ['owner_type',            'text'],
      ['category',              'text'],
      ['tags',                  'jsonb'],
      ['icon',                  'text'],
      ['version',               "text DEFAULT '1.0.0'"],
      ['is_deprecated',         'boolean DEFAULT false'],
      ['execution_count',       'integer DEFAULT 0'],
      ['last_executed_at',      'timestamp with time zone'],
      ['rate_limit_per_minute', 'integer'],
      ['rate_limit_per_hour',   'integer'],
    ];
    for (const [col, def] of toolCols) {
      if (!(await columnExists('tool', col))) {
        await sql.unsafe(`ALTER TABLE tool ADD COLUMN ${col} ${def}`);
        console.log(`  + tool.${col}`);
      }
    }
    console.log('  . tool columns done');

    // ── 9. usage_event columns ───────────────────────────────────────────────
    console.log('\nStep 9: usage_event columns...');
    const usageCols = [
      ['session_id',     'uuid REFERENCES session(session_id) ON DELETE SET NULL'],
      ['input_tokens',   'integer DEFAULT 0'],
      ['output_tokens',  'integer DEFAULT 0'],
      ['total_tokens',   'integer DEFAULT 0'],
      ['cost_usd',       'numeric(12, 8) DEFAULT 0'],
      ['model_id',       'text'],
      ['model_provider', 'text'],
    ];
    for (const [col, def] of usageCols) {
      if (!(await columnExists('usage_event', col))) {
        await sql.unsafe(`ALTER TABLE usage_event ADD COLUMN ${col} ${def}`);
        console.log(`  + usage_event.${col}`);
      }
    }
    console.log('  . usage_event columns done');

    console.log('\n✓ Phase 14 migration complete');
  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate().catch(() => process.exit(1));
