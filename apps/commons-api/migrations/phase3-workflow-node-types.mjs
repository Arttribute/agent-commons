#!/usr/bin/env node
/**
 * Phase 3 Migration: Workflow Node Types V2 + Task Timeout
 *
 * Adds:
 *   - workflow_execution.approval_token
 *   - workflow_execution.approval_data
 *   - workflow_execution.paused_node_outputs
 *   - workflow_execution.paused_at_node
 *   - task.timeout_ms
 *   - Support for 'awaiting_approval' status (comment only — text column)
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

async function indexExists(name) {
  const rows = await sql`
    SELECT 1 FROM pg_indexes WHERE indexname = ${name}
  `;
  return rows.length > 0;
}

async function migrate() {
  console.log('Phase 3: Workflow Node Types V2 + Task Timeout migration\n');

  try {
    // ── 1. workflow_execution: HITL columns ──────────────────────────────────
    console.log('Step 1: workflow_execution HITL columns...');

    if (!(await columnExists('workflow_execution', 'approval_token'))) {
      await sql`ALTER TABLE workflow_execution ADD COLUMN approval_token text`;
      console.log('  + workflow_execution.approval_token');
    } else {
      console.log('  . workflow_execution.approval_token already exists');
    }

    if (!(await columnExists('workflow_execution', 'approval_data'))) {
      await sql`ALTER TABLE workflow_execution ADD COLUMN approval_data jsonb`;
      console.log('  + workflow_execution.approval_data');
    } else {
      console.log('  . workflow_execution.approval_data already exists');
    }

    if (!(await columnExists('workflow_execution', 'paused_node_outputs'))) {
      await sql`ALTER TABLE workflow_execution ADD COLUMN paused_node_outputs jsonb`;
      console.log('  + workflow_execution.paused_node_outputs');
    } else {
      console.log('  . workflow_execution.paused_node_outputs already exists');
    }

    if (!(await columnExists('workflow_execution', 'paused_at_node'))) {
      await sql`ALTER TABLE workflow_execution ADD COLUMN paused_at_node text`;
      console.log('  + workflow_execution.paused_at_node');
    } else {
      console.log('  . workflow_execution.paused_at_node already exists');
    }

    // ── 2. task: timeout_ms ──────────────────────────────────────────────────
    console.log('\nStep 2: task.timeout_ms column...');

    if (!(await columnExists('task', 'timeout_ms'))) {
      await sql`ALTER TABLE task ADD COLUMN timeout_ms integer`;
      console.log('  + task.timeout_ms');
    } else {
      console.log('  . task.timeout_ms already exists');
    }

    // ── 3. Indexes ───────────────────────────────────────────────────────────
    console.log('\nStep 3: indexes...');

    if (!(await indexExists('idx_workflow_execution_approval_token'))) {
      await sql`
        CREATE UNIQUE INDEX idx_workflow_execution_approval_token
          ON workflow_execution (approval_token)
          WHERE approval_token IS NOT NULL
      `;
      console.log('  + idx_workflow_execution_approval_token');
    }

    if (!(await indexExists('idx_workflow_execution_status'))) {
      await sql`CREATE INDEX idx_workflow_execution_status ON workflow_execution (status)`;
      console.log('  + idx_workflow_execution_status');
    }

    console.log('\nPhase 3 migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
