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
  console.log('🔧 Fixing tool_permission table schema...\n');

  try {
    console.log('Step 1: Checking current tool_permission structure...');
    const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tool_permission'
      ORDER BY ordinal_position
    `;

    console.log('Current columns:', columns.map(c => c.column_name).join(', '));

    // Check if we need to migrate
    const hasOldSchema = columns.some(c => c.column_name === 'permission_id');

    if (hasOldSchema) {
      console.log('\n⚠️  Detected old schema. Migrating to new schema...');

      // Step 2: Rename the table temporarily
      console.log('Step 2: Backing up existing data...');
      await sql`ALTER TABLE tool_permission RENAME TO tool_permission_old`;

      // Step 3: Create new table with correct schema
      console.log('Step 3: Creating new tool_permission table...');
      await sql`
        CREATE TABLE tool_permission (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          tool_id UUID NOT NULL REFERENCES tool(tool_id) ON DELETE CASCADE,
          subject_id TEXT NOT NULL,
          subject_type TEXT NOT NULL,
          permission TEXT NOT NULL,
          granted_by TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE
        )
      `;

      // Step 4: Migrate data from old table to new table
      console.log('Step 4: Migrating data from old table...');
      const oldData = await sql`SELECT * FROM tool_permission_old WHERE revoked_at IS NULL`;

      if (oldData.length > 0) {
        console.log(`   Found ${oldData.length} active permissions to migrate`);

        for (const row of oldData) {
          await sql`
            INSERT INTO tool_permission (
              tool_id,
              subject_id,
              subject_type,
              permission,
              granted_by,
              created_at
            ) VALUES (
              ${row.tool_id},
              ${row.granted_to_id},
              ${row.granted_to_type},
              'execute',
              ${row.granted_by_id},
              ${row.granted_at}
            )
          `;
        }
        console.log('   ✓ Data migrated successfully');
      } else {
        console.log('   No data to migrate');
      }

      // Step 5: Drop old table
      console.log('Step 5: Cleaning up old table...');
      await sql`DROP TABLE tool_permission_old`;

      console.log('✓ Schema migration completed!');
    } else {
      console.log('✓ Schema already correct');

      // Just make sure all expected columns exist
      await sql`ALTER TABLE tool_permission ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'execute'`;
      await sql`ALTER TABLE tool_permission ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE`;
    }

    // Verify the final structure
    console.log('\n📊 Verifying tool_permission table structure...');
    const finalColumns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tool_permission'
      ORDER BY ordinal_position
    `;

    console.log('\ntool_permission columns:');
    finalColumns.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type}) - ${col.is_nullable === 'YES' ? 'nullable' : 'not null'}`);
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
