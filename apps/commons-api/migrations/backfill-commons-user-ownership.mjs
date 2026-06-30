#!/usr/bin/env node
/**
 * Backfill legacy user-owned records to a canonical Commons Identity user id.
 *
 * Dry run:
 *   BACKFILL_COMMONS_USER_ID=<identity-user-id> node migrations/backfill-commons-user-ownership.mjs
 *
 * Apply:
 *   BACKFILL_COMMONS_USER_ID=<identity-user-id> node migrations/backfill-commons-user-ownership.mjs --apply
 *
 * Optional:
 *   LEGACY_OWNER_IDS=bashybaranaba,0xabc...
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const apply = process.argv.includes('--apply');
const targetUserId =
  process.env.BACKFILL_COMMONS_USER_ID ||
  process.env.COMMONS_BACKFILL_USER_ID ||
  process.env.BASHYBARANABA_COMMONS_USER_ID;
const legacyOwnerIds = (
  process.env.LEGACY_OWNER_IDS || 'bashybaranaba'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!targetUserId) {
  console.error('BACKFILL_COMMONS_USER_ID is required.');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

const updates = [
  {
    label: 'agents.owner_user_id from legacy owner',
    statement: (execute) => execute`
      UPDATE agent
      SET owner_user_id = ${targetUserId}
      WHERE owner_user_id IS NULL
        AND owner = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'agents.owner legacy value',
    statement: (execute) => execute`
      UPDATE agent
      SET owner = ${targetUserId}
      WHERE owner = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'sessions.initiator',
    statement: (execute) => execute`
      UPDATE session
      SET initiator = ${targetUserId}
      WHERE initiator = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'tasks.created_by',
    statement: (execute) => execute`
      UPDATE task
      SET created_by = ${targetUserId},
          created_by_type = 'user'
      WHERE created_by = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'workflows.owner_id',
    statement: (execute) => execute`
      UPDATE workflow
      SET owner_id = ${targetUserId},
          owner_type = 'user'
      WHERE owner_id = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'tools.owner',
    statement: (execute) => execute`
      UPDATE tool
      SET owner = ${targetUserId},
          owner_type = 'user'
      WHERE owner = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'tool keys owner_id',
    statement: (execute) => execute`
      UPDATE tool_key
      SET owner_id = ${targetUserId},
          owner_type = 'user'
      WHERE owner_id = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'OAuth connections owner_id',
    statement: (execute) => execute`
      UPDATE oauth_connection
      SET owner_id = ${targetUserId},
          owner_type = 'user'
      WHERE owner_id = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'OAuth states owner_id',
    statement: (execute) => execute`
      UPDATE oauth_state
      SET owner_id = ${targetUserId}
      WHERE owner_id = ANY(${legacyOwnerIds})
    `,
  },
  {
    label: 'MCP servers owner_id',
    statement: (execute) => execute`
      UPDATE mcp_server
      SET owner_id = ${targetUserId},
          owner_type = 'user'
      WHERE owner_id = ANY(${legacyOwnerIds})
    `,
  },
];

async function tableExists(tableName) {
  const rows = await sql`
    SELECT to_regclass(${`public.${tableName}`}) AS table_name
  `;
  return Boolean(rows[0]?.table_name);
}

async function run() {
  console.log(`Backfilling ownership to ${targetUserId}`);
  console.log(`Legacy owners: ${legacyOwnerIds.join(', ')}`);
  console.log(apply ? 'Mode: apply' : 'Mode: dry-run');

  await sql.begin(async (tx) => {
    for (const update of updates) {
      const tableName = update.label.split('.')[0].replace('OAuth ', 'oauth_');
      const inferredTable =
        update.label.startsWith('agents') ? 'agent' :
        update.label.startsWith('sessions') ? 'session' :
        update.label.startsWith('tasks') ? 'task' :
        update.label.startsWith('workflows') ? 'workflow' :
        update.label.startsWith('tools') ? 'tool' :
        update.label.startsWith('tool keys') ? 'tool_key' :
        update.label.startsWith('OAuth connections') ? 'oauth_connection' :
        update.label.startsWith('OAuth states') ? 'oauth_state' :
        update.label.startsWith('MCP servers') ? 'mcp_server' :
        tableName;

      if (!(await tableExists(inferredTable))) {
        console.log(`  - ${update.label}: skipped, table ${inferredTable} missing`);
        continue;
      }

      const result = await update.statement(tx);
      console.log(`  - ${update.label}: ${result.count ?? 0} row(s)`);
    }

    if (!apply) {
      throw new Error('__DRY_RUN_ROLLBACK__');
    }
  }).catch((error) => {
    if (error.message === '__DRY_RUN_ROLLBACK__') {
      console.log('Dry-run complete; no changes committed.');
      return;
    }
    throw error;
  });

  if (apply) console.log('Backfill committed.');
}

run()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
