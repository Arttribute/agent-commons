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
  console.log('🔧 Adding missing columns to workflow_execution table...\n');

  try {
    // Step 1: Check and add created_at column
    console.log('Step 1: Checking for created_at column...');
    const createdAtColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflow_execution' AND column_name = 'created_at'
    `;

    if (createdAtColumn.length === 0) {
      console.log('   Adding created_at column...');
      await sql`
        ALTER TABLE workflow_execution
        ADD COLUMN created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
      `;
      console.log('   ✓ Added created_at column');
    } else {
      console.log('   ✓ created_at column already exists');
    }

    // Step 2: Rename error to error_message
    console.log('\nStep 2: Checking for error column rename...');
    const errorColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflow_execution' AND column_name = 'error'
    `;

    const errorMessageColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflow_execution' AND column_name = 'error_message'
    `;

    if (errorColumn.length > 0 && errorMessageColumn.length === 0) {
      console.log('   Renaming error column to error_message...');
      await sql`ALTER TABLE workflow_execution RENAME COLUMN error TO error_message`;
      console.log('   ✓ Renamed error to error_message');
    } else if (errorMessageColumn.length > 0) {
      console.log('   ✓ error_message column already exists');
    } else {
      console.log('   Adding error_message column...');
      await sql`
        ALTER TABLE workflow_execution
        ADD COLUMN IF NOT EXISTS error_message TEXT
      `;
      console.log('   ✓ Added error_message column');
    }

    // Step 3: Check and add node_results column
    console.log('\nStep 3: Checking for node_results column...');
    const nodeResultsColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflow_execution' AND column_name = 'node_results'
    `;

    if (nodeResultsColumn.length === 0) {
      console.log('   Adding node_results column...');
      await sql`
        ALTER TABLE workflow_execution
        ADD COLUMN node_results jsonb
      `;
      console.log('   ✓ Added node_results column');
    } else {
      console.log('   ✓ node_results column already exists');
    }

    // Step 4: Make agent_id nullable (schema has it as optional)
    console.log('\nStep 4: Updating agent_id to allow NULL...');
    const agentIdNullable = await sql`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workflow_execution' AND column_name = 'agent_id'
    `;

    if (agentIdNullable.length > 0 && agentIdNullable[0].is_nullable === 'NO') {
      console.log('   Making agent_id nullable...');
      await sql`ALTER TABLE workflow_execution ALTER COLUMN agent_id DROP NOT NULL`;
      console.log('   ✓ agent_id is now nullable');
    } else {
      console.log('   ✓ agent_id is already nullable');
    }

    // Step 5: Make input_data nullable
    console.log('\nStep 5: Updating input_data to allow NULL...');
    const inputDataNullable = await sql`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workflow_execution' AND column_name = 'input_data'
    `;

    if (inputDataNullable.length > 0 && inputDataNullable[0].is_nullable === 'NO') {
      console.log('   Making input_data nullable...');
      await sql`ALTER TABLE workflow_execution ALTER COLUMN input_data DROP NOT NULL`;
      console.log('   ✓ input_data is now nullable');
    } else {
      console.log('   ✓ input_data is already nullable');
    }

    // Step 6: Fix session_id type (should be uuid)
    console.log('\nStep 6: Checking session_id column type...');
    const sessionIdType = await sql`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'workflow_execution' AND column_name = 'session_id'
    `;

    if (sessionIdType.length > 0 && sessionIdType[0].data_type === 'text') {
      console.log('   Converting session_id from text to uuid...');
      try {
        // First, delete any rows with invalid UUID values
        await sql`DELETE FROM workflow_execution WHERE session_id IS NOT NULL AND session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;

        // Then convert the column type
        await sql`ALTER TABLE workflow_execution ALTER COLUMN session_id TYPE uuid USING session_id::uuid`;
        console.log('   ✓ Converted session_id to uuid');
      } catch (error) {
        console.log('   ⚠️  Could not convert session_id to uuid:', error.message);
        console.log('   Skipping this step - manual intervention may be required');
      }
    } else {
      console.log('   ✓ session_id is already uuid type');
    }

    // Verify final structure
    console.log('\n📊 Verifying workflow_execution table structure...');
    const finalColumns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'workflow_execution'
      ORDER BY ordinal_position
    `;

    console.log('\nWorkflow_execution columns:');
    finalColumns.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type}) - ${col.is_nullable === 'YES' ? 'nullable' : 'not null'}${col.column_default ? ` - default: ${col.column_default}` : ''}`);
    });

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

migrate().catch(console.error);
