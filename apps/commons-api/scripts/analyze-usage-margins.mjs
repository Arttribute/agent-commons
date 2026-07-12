#!/usr/bin/env node
/**
 * Read-only margin sanity check for pricing.
 *
 * Aggregates historical usage_event.cost_usd per owner per month and reports the
 * distribution (p50/p90/p99) of monthly spend, so we can sanity-check the tier
 * credit grants against real usage before finalizing prices. Also prints per-
 * model cost share.
 *
 * Usage:
 *   node scripts/analyze-usage-margins.mjs            # against DATABASE_URL / POSTGRES_*
 *   CREDIT_UNITS_PER_USD=1000 node scripts/analyze-usage-margins.mjs
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const RATE = Number(process.env.CREDIT_UNITS_PER_USD || 1000);

function conn() {
  const ssl =
    process.env.POSTGRES_SSL === 'require'
      ? { rejectUnauthorized: false }
      : undefined;
  if (process.env.DATABASE_URL)
    return [process.env.DATABASE_URL, { ssl, max: 1, onnotice: () => {} }];
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

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  const sql = postgres(...conn());
  try {
    // Per owner per month spend (exclude BYOK — those cost us nothing).
    const rows = await sql`
      SELECT
        a.owner_user_id AS owner,
        date_trunc('month', ue.created_at) AS month,
        sum(ue.cost_usd) AS cost_usd
      FROM usage_event ue
      JOIN agent a ON a.agent_id = ue.agent_id
      WHERE coalesce(ue.is_byok, false) = false
      GROUP BY 1, 2
      HAVING sum(ue.cost_usd) > 0
      ORDER BY 3 DESC
    `;

    const costs = rows.map((r) => Number(r.cost_usd)).sort((a, b) => a - b);
    const monthlyRows = rows.length;

    console.log('=== Monthly LLM spend per owner (non-BYOK) ===');
    console.log(`samples (owner-months): ${monthlyRows}`);
    if (monthlyRows) {
      console.log(`p50: $${pct(costs, 50).toFixed(2)}  (${Math.round(pct(costs, 50) * RATE)} credits)`);
      console.log(`p90: $${pct(costs, 90).toFixed(2)}  (${Math.round(pct(costs, 90) * RATE)} credits)`);
      console.log(`p99: $${pct(costs, 99).toFixed(2)}  (${Math.round(pct(costs, 99) * RATE)} credits)`);
      console.log(`max: $${pct(costs, 100).toFixed(2)}  (${Math.round(pct(costs, 100) * RATE)} credits)`);
    }

    console.log('\n=== Tier grants (at %d credits/USD) ===', RATE);
    for (const [key, usd] of [
      ['free', 500 / RATE],
      ['plus $20', 5000 / RATE],
      ['pro $50', 14000 / RATE],
      ['max $200', 60000 / RATE],
    ]) {
      console.log(`${key}: grant covers ~$${usd.toFixed(2)} of usage`);
    }

    const byModel = await sql`
      SELECT ue.provider, ue.model_id,
             count(*) AS calls,
             sum(ue.cost_usd) AS cost_usd
      FROM usage_event ue
      WHERE coalesce(ue.is_byok, false) = false
      GROUP BY 1, 2
      ORDER BY 4 DESC
      LIMIT 15
    `;
    console.log('\n=== Top models by cost ===');
    for (const m of byModel) {
      console.log(
        `${m.provider}/${m.model_id}: ${m.calls} calls, $${Number(m.cost_usd).toFixed(2)}`,
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('Analysis failed:', err.message);
  process.exit(1);
});
