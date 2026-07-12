#!/usr/bin/env node
/**
 * Versioned, tracked database migration runner.
 *
 * Applies the ordered SQL files in migrations/versioned/ (NNN_name.sql) that
 * have not yet been recorded in the schema_migrations table, each inside its
 * own transaction. Idempotent: re-running only applies new files.
 *
 * This is the ONLY migration path for the fresh production DB and for keeping
 * staging in sync. The legacy ad-hoc scripts in migrations/*.{sql,mjs} are not
 * touched by this runner (they predate it); 000_baseline.sql captures the
 * schema they collectively produced.
 *
 * Connection (in priority order):
 *   DATABASE_URL, else POSTGRES_HOST/PORT/DATABASE/USER/PASSWORD.
 *   Set POSTGRES_SSL=require for managed databases that require TLS.
 *
 * Usage:
 *   node scripts/migrate.mjs            # apply pending migrations
 *   node scripts/migrate.mjs --status   # list applied / pending, apply nothing
 *   node scripts/migrate.mjs --dry-run  # show what would run
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const VERSIONED_DIR = join(__dirname, '../migrations/versioned');
const statusOnly = process.argv.includes('--status');
const dryRun = process.argv.includes('--dry-run');

function connectionOptions() {
  const ssl =
    process.env.POSTGRES_SSL === 'require'
      ? { rejectUnauthorized: false }
      : undefined;
  if (process.env.DATABASE_URL) {
    return [process.env.DATABASE_URL, { ssl, max: 1, onnotice: () => {} }];
  }
  return [
    {
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DATABASE,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      ssl,
      max: 1,
      onnotice: () => {},
    },
  ];
}

function loadMigrations() {
  let files;
  try {
    files = readdirSync(VERSIONED_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort() // NNN_ prefixes sort lexicographically = numerically
    .map((name) => ({
      name,
      sql: readFileSync(join(VERSIONED_DIR, name), 'utf8'),
    }));
}

async function main() {
  const sql = postgres(...connectionOptions());
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const applied = new Set(
      (await sql`SELECT name FROM schema_migrations`).map((r) => r.name),
    );
    const migrations = loadMigrations();
    const pending = migrations.filter((m) => !applied.has(m.name));

    if (statusOnly) {
      console.log(`Applied (${applied.size}):`);
      for (const m of migrations)
        if (applied.has(m.name)) console.log(`  ✓ ${m.name}`);
      console.log(`Pending (${pending.length}):`);
      for (const m of pending) console.log(`  • ${m.name}`);
      return;
    }

    if (!pending.length) {
      console.log('No pending migrations. Database is up to date.');
      return;
    }

    console.log(`Applying ${pending.length} migration(s)...`);
    for (const m of pending) {
      if (dryRun) {
        console.log(`  [dry-run] would apply ${m.name}`);
        continue;
      }
      process.stdout.write(`  → ${m.name} ... `);
      await sql.begin(async (tx) => {
        await tx.unsafe(m.sql);
        await tx`INSERT INTO schema_migrations (name) VALUES (${m.name})`;
      });
      console.log('done');
    }
    console.log('Migrations complete.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
