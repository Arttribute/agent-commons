#!/usr/bin/env node

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from apps/commons-api/.env
dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL);

async function migrate() {
  console.log('🔧 Adding tool ownership and access control columns...\n');

  try {
    // Keep owner column as is (don't rename to owner_id)
    console.log('✓ Keeping "owner" column as is...');

    // Add owner_type if it doesn't exist
    console.log('✓ Adding "owner_type" column...');
    await sql`
      ALTER TABLE tool
      ADD COLUMN IF NOT EXISTS owner_type text
    `;

    // Add visibility if it doesn't exist
    console.log('✓ Adding "visibility" column...');
    await sql`
      ALTER TABLE tool
      ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'private' NOT NULL
    `;

    // Add display_name if it doesn't exist
    console.log('✓ Adding "display_name" column...');
    await sql`
      ALTER TABLE tool
      ADD COLUMN IF NOT EXISTS display_name text
    `;

    // Update existing rows to have owner_type = 'user' if NULL
    console.log('✓ Updating NULL owner_type values to "user"...');
    await sql`
      UPDATE tool
      SET owner_type = 'user'
      WHERE owner_type IS NULL AND owner IS NOT NULL
    `;

    // Verify the columns
    console.log('\n📊 Verifying tool table structure...');
    const columns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tool'
      AND column_name IN ('owner', 'owner_type', 'visibility', 'display_name')
      ORDER BY column_name
    `;

    console.log('\nTool table columns:');
    columns.forEach(col => {
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
