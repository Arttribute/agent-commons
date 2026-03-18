#!/usr/bin/env node
/**
 * Phase 11: Drop legacy agent.wallet JSONB column
 *
 * Prerequisites: Phase 10 must have run (agent_wallet table exists).
 * All agents now use agent_wallet rows — the old JSONB column is safe to drop.
 *
 * Run: node migrations/phase11-drop-wallet-column.mjs
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DATABASE ?? 'agentcommons',
  username: process.env.POSTGRES_USER     ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
});

async function columnExists(table, column) {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = ${table}
      AND column_name  = ${column}
  `;
  return rows.length > 0;
}

async function tableExists(table) {
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return rows.length > 0;
}

async function run() {
  console.log('Phase 11: Drop legacy agent.wallet column\n');

  // Safety: agent_wallet table must exist before we drop the old column
  if (!(await tableExists('agent_wallet'))) {
    console.error('  ✗ agent_wallet table not found — run phase10 first');
    process.exit(1);
  }

  if (!(await columnExists('agent', 'wallet'))) {
    console.log('  · agent.wallet column already removed — nothing to do');
  } else {
    await sql`ALTER TABLE agent DROP COLUMN wallet`;
    console.log('  ✓ Dropped agent.wallet JSONB column');
  }

  console.log('\nPhase 11 migration complete.');
  await sql.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
