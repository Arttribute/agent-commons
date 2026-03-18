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
  console.log('🔧 Cleaning up tool_key column names...\n');

  try {
    // Check which columns exist
    console.log('Step 1: Checking current column names...');
    const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tool_key'
      AND column_name IN ('iv', 'auth_tag', 'encryption_iv', 'encryption_tag')
      ORDER BY column_name
    `;

    const columnNames = columns.map(c => c.column_name);
    console.log('Found columns:', columnNames.join(', '));

    const hasOldIV = columnNames.includes('iv');
    const hasOldTag = columnNames.includes('auth_tag');
    const hasNewIV = columnNames.includes('encryption_iv');
    const hasNewTag = columnNames.includes('encryption_tag');

    // Strategy: If both old and new exist, copy data from old to new, then drop old
    if (hasOldIV && hasNewIV) {
      console.log('\nStep 2: Found duplicate iv columns. Migrating data...');

      // Copy data from old iv column to new encryption_iv if encryption_iv is null
      await sql`
        UPDATE tool_key
        SET encryption_iv = iv
        WHERE encryption_iv IS NULL AND iv IS NOT NULL
      `;

      // Drop the old iv column
      console.log('Step 3: Dropping old "iv" column...');
      await sql`ALTER TABLE tool_key DROP COLUMN IF EXISTS iv`;
      console.log('   ✓ Dropped old "iv" column');
    } else if (hasOldIV && !hasNewIV) {
      console.log('\nStep 2: Renaming "iv" to "encryption_iv"...');
      await sql`ALTER TABLE tool_key RENAME COLUMN iv TO encryption_iv`;
      console.log('   ✓ Renamed column');
    }

    if (hasOldTag && hasNewTag) {
      console.log('\nStep 4: Found duplicate tag columns. Migrating data...');

      // Copy data from old auth_tag column to new encryption_tag if encryption_tag is null
      await sql`
        UPDATE tool_key
        SET encryption_tag = auth_tag
        WHERE encryption_tag IS NULL AND auth_tag IS NOT NULL
      `;

      // Drop the old auth_tag column
      console.log('Step 5: Dropping old "auth_tag" column...');
      await sql`ALTER TABLE tool_key DROP COLUMN IF EXISTS auth_tag`;
      console.log('   ✓ Dropped old "auth_tag" column');
    } else if (hasOldTag && !hasNewTag) {
      console.log('\nStep 4: Renaming "auth_tag" to "encryption_tag"...');
      await sql`ALTER TABLE tool_key RENAME COLUMN auth_tag TO encryption_tag`;
      console.log('   ✓ Renamed column');
    }

    // Ensure the new columns exist and are NOT NULL
    console.log('\nStep 6: Ensuring new columns exist with correct constraints...');

    // Add columns if they don't exist (they should by now)
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS encryption_iv TEXT`;
    await sql`ALTER TABLE tool_key ADD COLUMN IF NOT EXISTS encryption_tag TEXT`;

    // Make them NOT NULL (this will fail if there are NULL values, which means we have a data issue)
    try {
      await sql`ALTER TABLE tool_key ALTER COLUMN encryption_iv SET NOT NULL`;
      await sql`ALTER TABLE tool_key ALTER COLUMN encryption_tag SET NOT NULL`;
      console.log('   ✓ Set NOT NULL constraints on new columns');
    } catch (error) {
      console.log('   ⚠️  Could not set NOT NULL constraints (might have existing NULL values)');
    }

    // Verify final structure
    console.log('\n📊 Verifying tool_key encryption columns...');
    const finalColumns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tool_key'
      AND column_name IN ('encryption_iv', 'encryption_tag', 'encrypted_value')
      ORDER BY column_name
    `;

    console.log('\nEncryption columns:');
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
