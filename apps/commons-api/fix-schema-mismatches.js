const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSchemaMismatches() {
  try {
    console.log('🔍 Checking for schema mismatches...\n');
    
    // Add missing last_run_at column to task table
    console.log('1. Adding last_run_at column to task table...');
    const { error: taskError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE task 
        ADD COLUMN IF NOT EXISTS last_run_at timestamp with time zone;
      `
    });
    
    if (taskError) {
      console.error('❌ Error adding last_run_at:', taskError);
    } else {
      console.log('✅ Successfully added last_run_at column');
    }
    
    // Verify task table columns
    console.log('\n2. Verifying task table scheduling columns...');
    const { data: taskCols, error: taskColsError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'task' 
        AND column_name IN ('last_run_at', 'next_run_at', 'scheduled_for', 'cron_expression')
        ORDER BY column_name;
      `
    });
    
    if (!taskColsError && taskCols) {
      console.log('Task scheduling columns:', taskCols);
    }
    
    // Check workflow table
    console.log('\n3. Verifying workflow table columns...');
    const { data: workflowCols, error: workflowError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'workflow'
        ORDER BY column_name;
      `
    });
    
    if (!workflowError && workflowCols) {
      console.log('Workflow columns:', workflowCols.map(c => c.column_name).join(', '));
    }
    
    // Check tool table
    console.log('\n4. Verifying tool table columns...');
    const { data: toolCols, error: toolError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'tool'
        ORDER BY column_name;
      `
    });
    
    if (!toolError && toolCols) {
      console.log('Tool columns:', toolCols.map(c => c.column_name).join(', '));
    }
    
    console.log('\n✅ Schema verification complete!');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

fixSchemaMismatches();
