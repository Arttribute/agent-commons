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
  console.log('🔧 Adding missing columns to workflow table...\n');

  try {
    // Check if version column exists
    console.log('Step 1: Checking for version column...');
    const versionColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflow' AND column_name = 'version'
    `;

    if (versionColumn.length === 0) {
      console.log('   Adding version column...');
      await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0.0'`;
      console.log('   ✓ Added version column');
    } else {
      console.log('   ✓ version column already exists');
    }

    // Check if is_template column exists
    console.log('\nStep 2: Checking for is_template column...');
    const isTemplateColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflow' AND column_name = 'is_template'
    `;

    if (isTemplateColumn.length === 0) {
      console.log('   Adding is_template column...');
      await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false`;
      console.log('   ✓ Added is_template column');
    } else {
      console.log('   ✓ is_template column already exists');
    }

    // Check if is_public column exists
    console.log('\nStep 3: Checking for is_public column...');
    const isPublicColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflow' AND column_name = 'is_public'
    `;

    if (isPublicColumn.length === 0) {
      console.log('   Adding is_public column...');
      await sql`ALTER TABLE workflow ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`;
      console.log('   ✓ Added is_public column');
    } else {
      console.log('   ✓ is_public column already exists');
    }

    // Verify final structure
    console.log('\n📊 Verifying workflow table structure...');
    const finalColumns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'workflow'
      ORDER BY ordinal_position
    `;

    console.log('\nWorkflow columns:');
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
