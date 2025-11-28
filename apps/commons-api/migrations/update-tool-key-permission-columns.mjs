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
  console.log('🔧 Updating tool_key and tool_permission tables...\n');

  try {
    // Check if tool_key table exists
    const toolKeyExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'tool_key'
      )
    `;

    if (!toolKeyExists[0].exists) {
      console.log('❌ tool_key table does not exist. Creating it...');
      await sql`
        CREATE TABLE tool_key (
          key_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          key_name TEXT NOT NULL,
          display_name TEXT,
          description TEXT,
          encrypted_value TEXT NOT NULL,
          encryption_iv TEXT NOT NULL,
          encryption_tag TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          owner_type TEXT NOT NULL,
          tool_id UUID REFERENCES tool(tool_id) ON DELETE CASCADE,
          key_type TEXT DEFAULT 'api-key',
          is_active BOOLEAN DEFAULT true,
          usage_count INTEGER DEFAULT 0,
          last_used_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE
        )
      `;
      console.log('✓ Created tool_key table');
    } else {
      console.log('✓ tool_key table exists');

      // Add missing columns to tool_key
      console.log('✓ Checking for missing columns in tool_key...');

      await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS description TEXT`;
      await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS display_name TEXT`;
      await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS key_type TEXT DEFAULT 'api-key'`;
      await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`;
      await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0`;
      await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE`;
      await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE`;

      console.log('✓ Added missing columns to tool_key');
    }

    // Check if tool_permission table exists
    const toolPermissionExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'tool_permission'
      )
    `;

    if (!toolPermissionExists[0].exists) {
      console.log('❌ tool_permission table does not exist. Creating it...');
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
      console.log('✓ Created tool_permission table');
    } else {
      console.log('✓ tool_permission table exists');

      // Verify id column exists (should be the primary key)
      const columns = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'tool_permission' AND column_name = 'id'
      `;

      if (columns.length === 0) {
        console.log('❌ tool_permission table missing "id" column. This should not happen!');
        console.log('   The table may need to be recreated.');
      } else {
        console.log('✓ tool_permission has id column');
      }
    }

    // Verify the changes
    console.log('\n📊 Verifying tool_key table structure...');
    const toolKeyColumns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tool_key'
      ORDER BY ordinal_position
    `;

    console.log('\ntool_key columns:');
    toolKeyColumns.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type})`);
    });

    console.log('\n📊 Verifying tool_permission table structure...');
    const toolPermissionColumns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tool_permission'
      ORDER BY ordinal_position
    `;

    console.log('\ntool_permission columns:');
    toolPermissionColumns.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type})`);
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
