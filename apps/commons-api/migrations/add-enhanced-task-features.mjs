#!/usr/bin/env node

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL);

async function migrate() {
  console.log('🔧 Adding enhanced task features to task table...\n');

  try {
    // Step 1: Add tool_constraint_type column
    console.log('Step 1: Checking for tool_constraint_type column...');
    const toolConstraintColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'task' AND column_name = 'tool_constraint_type'
    `;

    if (toolConstraintColumn.length === 0) {
      console.log('   Adding tool_constraint_type column...');
      await sql`
        ALTER TABLE task
        ADD COLUMN tool_constraint_type text DEFAULT 'none' NOT NULL
      `;
      console.log('   ✓ Added tool_constraint_type column (default: "none")');
    } else {
      console.log('   ✓ tool_constraint_type column already exists');
    }

    // Step 2: Add tool_instructions column
    console.log('\nStep 2: Checking for tool_instructions column...');
    const toolInstructionsColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'task' AND column_name = 'tool_instructions'
    `;

    if (toolInstructionsColumn.length === 0) {
      console.log('   Adding tool_instructions column...');
      await sql`
        ALTER TABLE task
        ADD COLUMN tool_instructions text
      `;
      console.log('   ✓ Added tool_instructions column');
    } else {
      console.log('   ✓ tool_instructions column already exists');
    }

    // Step 3: Add recurring_session_mode column
    console.log('\nStep 3: Checking for recurring_session_mode column...');
    const recurringSessionModeColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'task' AND column_name = 'recurring_session_mode'
    `;

    if (recurringSessionModeColumn.length === 0) {
      console.log('   Adding recurring_session_mode column...');
      await sql`
        ALTER TABLE task
        ADD COLUMN recurring_session_mode text DEFAULT 'same' NOT NULL
      `;
      console.log('   ✓ Added recurring_session_mode column (default: "same")');
    } else {
      console.log('   ✓ recurring_session_mode column already exists');
    }

    // Step 4: Add index for efficient querying of pending tasks
    console.log('\nStep 4: Creating index for task querying...');
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_task_agent_session_status_priority
        ON task(agent_id, session_id, status, priority DESC, created_at ASC)
      `;
      console.log('   ✓ Created composite index for efficient task querying');
    } catch (error) {
      console.log('   ⚠️  Index may already exist or could not be created:', error.message);
    }

    // Step 5: Add index for recurring task scheduling
    console.log('\nStep 5: Creating index for recurring task scheduling...');
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_task_recurring_next_run
        ON task(is_recurring, next_run_at)
        WHERE is_recurring = true AND status = 'pending'
      `;
      console.log('   ✓ Created partial index for recurring tasks');
    } catch (error) {
      console.log('   ⚠️  Index may already exist or could not be created:', error.message);
    }

    // Verify final structure
    console.log('\n📊 Verifying task table structure...');
    const finalColumns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'task'
      ORDER BY ordinal_position
    `;

    console.log('\nTask table columns (showing new additions):');
    const newColumns = ['tool_constraint_type', 'tool_instructions', 'recurring_session_mode'];
    finalColumns
      .filter(col => newColumns.includes(col.column_name))
      .forEach(col => {
        console.log(`  ✓ ${col.column_name} (${col.data_type}) - ${col.is_nullable === 'YES' ? 'nullable' : 'not null'}${col.column_default ? ` - default: ${col.column_default}` : ''}`);
      });

    // Verify indexes
    console.log('\n📊 Verifying task indexes...');
    const indexes = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'task'
      AND indexname LIKE 'idx_task_%'
    `;

    console.log('\nTask table indexes:');
    indexes.forEach(idx => {
      console.log(`  ✓ ${idx.indexname}`);
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNew features added:');
    console.log('  • Tool constraint types (hard/soft/none) for flexible tool usage control');
    console.log('  • Tool instructions field for agent guidance');
    console.log('  • Recurring session mode (same/new) for recurring task session management');
    console.log('  • Performance indexes for task querying and scheduling');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

migrate().catch(console.error);
