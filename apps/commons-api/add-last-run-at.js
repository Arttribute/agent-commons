const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function addLastRunAt() {
  try {
    console.log('Adding last_run_at column to task table...');
    
    await sql`
      ALTER TABLE task 
      ADD COLUMN IF NOT EXISTS last_run_at timestamp with time zone
    `;
    
    console.log('✅ Successfully added last_run_at column');
    
    // Verify the column was added
    const result = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'task' 
      AND column_name IN ('last_run_at', 'next_run_at', 'scheduled_for')
    `;
    
    console.log('Task scheduling columns:', result.map(r => r.column_name));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
  }
}

addLastRunAt();
