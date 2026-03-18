/**
 * Phase 12 — Add trace_id to usage_event
 *
 * Adds a nullable `trace_id` UUID column to the `usage_event` table.
 * This links all LLM calls that belong to a single top-level runAgent()
 * invocation, enabling per-run cost attribution and log correlation.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const sql = postgres(process.env.DATABASE_URL);

try {
  console.log('Phase 12: Adding trace_id to usage_event…');

  // Idempotent: skip if column already exists
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'usage_event' AND column_name = 'trace_id'
    ) AS exists
  `;

  if (exists) {
    console.log('  ✓ trace_id column already exists — skipping');
  } else {
    await sql`ALTER TABLE usage_event ADD COLUMN trace_id UUID`;
    await sql`CREATE INDEX idx_usage_event_trace_id ON usage_event (trace_id) WHERE trace_id IS NOT NULL`;
    console.log('  ✓ Added trace_id column + index');
  }

  console.log('Phase 12 complete.');
} finally {
  await sql.end();
}
