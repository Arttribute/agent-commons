#!/usr/bin/env node
/**
 * Phase 10: Wallet Migration
 *
 * Goals:
 *  1. Create the agent_wallet table (owner-controlled wallets)
 *  2. Make agent.wallet column nullable (migration window)
 *
 * Run: node migrations/phase10-wallet-migration.mjs
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
  console.log('Phase 10: Wallet Migration');

  // ── 1. Create agent_wallet table ──────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS agent_wallet (
      id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id              TEXT NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
      wallet_type           TEXT NOT NULL DEFAULT 'eoa',
      address               TEXT NOT NULL,
      encrypted_private_key TEXT,
      smart_account_address TEXT,
      session_permissions   JSONB,
      chain_id              TEXT NOT NULL DEFAULT '84532',
      label                 TEXT DEFAULT 'Primary',
      is_active             BOOLEAN NOT NULL DEFAULT TRUE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
    )
  `;
  console.log('  ✓ agent_wallet table created (or already exists)');

  // ── 2. Indexes ────────────────────────────────────────────────────────────
  for (const [name, ddl] of [
    ['idx_agent_wallet_agent_id', `CREATE INDEX IF NOT EXISTS idx_agent_wallet_agent_id ON agent_wallet(agent_id)`],
    ['idx_agent_wallet_active',   `CREATE INDEX IF NOT EXISTS idx_agent_wallet_active ON agent_wallet(agent_id, is_active)`],
  ]) {
    await sql.unsafe(ddl);
    console.log(`  ✓ index ${name}`);
  }

  // ── 3. Make agent.wallet nullable ─────────────────────────────────────────
  try {
    await sql`ALTER TABLE agent ALTER COLUMN wallet DROP NOT NULL`;
    console.log('  ✓ agent.wallet column is now nullable');
  } catch (e) {
    // Already nullable — fine
    if (e.message?.includes('already')) {
      console.log('  · agent.wallet already nullable');
    } else {
      console.log('  · agent.wallet: ', e.message);
    }
  }

  await sql.end();
  console.log('\nPhase 10 migration complete.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
