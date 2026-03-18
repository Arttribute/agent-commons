#!/usr/bin/env node
/**
 * Phase 9 Migration: Agent Memory System
 *
 * Adds:
 *   - agent_memory table — episodic / semantic / procedural memories per agent
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
    SELECT 1 FROM information_schema.tables WHERE table_name = ${table}
  `;
  return rows.length > 0;
}

async function indexExists(name) {
  const rows = await sql`SELECT 1 FROM pg_indexes WHERE indexname = ${name}`;
  return rows.length > 0;
}

async function migrate() {
  console.log('Phase 9: Agent Memory System migration\n');

  try {
    console.log('Step 1: agent_memory table...');

    if (!(await tableExists('agent_memory'))) {
      await sql`
        CREATE TABLE agent_memory (
          memory_id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          agent_id          text NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
          session_id        uuid REFERENCES session(session_id) ON DELETE SET NULL,

          -- Memory classification
          memory_type       text NOT NULL DEFAULT 'semantic',
          -- 'episodic'   — specific events ("User asked me to format responses as bullet points")
          -- 'semantic'   — general facts ("User's name is Alex, works at Acme Corp")
          -- 'procedural' — learned behaviours ("Always check the docs before answering API questions")

          -- Content
          content           text NOT NULL,
          summary           text NOT NULL,

          -- Scoring / ranking
          importance_score  real NOT NULL DEFAULT 0.5,  -- 0.0 (trivial) → 1.0 (critical)
          access_count      integer NOT NULL DEFAULT 0,
          last_accessed_at  timestamptz,

          -- Keyword tags for retrieval
          tags              jsonb NOT NULL DEFAULT '[]'::jsonb,

          -- Origin
          source_type       text NOT NULL DEFAULT 'auto',
          -- 'auto'   — extracted by consolidation LLM after session
          -- 'manual' — user explicitly added

          is_active         boolean NOT NULL DEFAULT true,
          expires_at        timestamptz,  -- optional TTL

          created_at        timestamptz NOT NULL DEFAULT timezone('utc', now()),
          updated_at        timestamptz NOT NULL DEFAULT timezone('utc', now())
        )
      `;
      console.log('  + agent_memory table created');
    } else {
      console.log('  . agent_memory already exists');
    }

    console.log('\nStep 2: indexes...');

    const indexes = [
      ['idx_agent_memory_agent_id', `CREATE INDEX idx_agent_memory_agent_id ON agent_memory (agent_id)`],
      ['idx_agent_memory_importance', `CREATE INDEX idx_agent_memory_importance ON agent_memory (agent_id, importance_score DESC)`],
      ['idx_agent_memory_active', `CREATE INDEX idx_agent_memory_active ON agent_memory (agent_id) WHERE is_active = true`],
    ];

    for (const [name, ddl] of indexes) {
      if (!(await indexExists(name))) {
        await sql.unsafe(ddl);
        console.log(`  + ${name}`);
      } else {
        console.log(`  . ${name} already exists`);
      }
    }

    console.log('\nPhase 9 migration complete.\n');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
