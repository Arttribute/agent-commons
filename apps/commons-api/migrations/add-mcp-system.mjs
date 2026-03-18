#!/usr/bin/env node

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env
dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL);

async function migrate() {
  console.log('🔧 Adding MCP (Model Context Protocol) system to database...\n');

  try {
    // 1. Create mcp_server table
    console.log('✓ Creating mcp_server table...');
    await sql`
      CREATE TABLE IF NOT EXISTS mcp_server (
        server_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

        -- Identity
        name TEXT NOT NULL,
        description TEXT,

        -- Ownership
        owner_id TEXT NOT NULL,
        owner_type TEXT NOT NULL, -- 'user' | 'agent'

        -- Connection configuration
        connection_type TEXT NOT NULL, -- 'stdio' | 'sse'
        connection_config JSONB NOT NULL, -- { command, args, env } or { url }

        -- Connection status
        status TEXT DEFAULT 'disconnected', -- 'connected' | 'disconnected' | 'error'
        last_error TEXT,
        last_connected_at TIMESTAMP WITH TIME ZONE,

        -- Discovery cache
        capabilities JSONB, -- { tools, resources, prompts }
        tools_discovered JSONB, -- Cached tool list
        last_synced_at TIMESTAMP WITH TIME ZONE,

        -- Metadata
        is_public BOOLEAN DEFAULT false,
        tags JSONB,

        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
      )
    `;

    // 2. Create mcp_tool table
    console.log('✓ Creating mcp_tool table...');
    await sql`
      CREATE TABLE IF NOT EXISTS mcp_tool (
        mcp_tool_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

        -- Server reference
        server_id UUID NOT NULL REFERENCES mcp_server(server_id) ON DELETE CASCADE,

        -- Tool identity
        tool_name TEXT NOT NULL,
        display_name TEXT,
        description TEXT,

        -- Schema (MCP format, compatible with OpenAI)
        input_schema JSONB NOT NULL, -- { type: 'object', properties, required }

        -- Metadata
        is_active BOOLEAN DEFAULT true,
        last_used_at TIMESTAMP WITH TIME ZONE,
        usage_count INTEGER DEFAULT 0,

        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
      )
    `;

    // 3. Create indexes for performance
    console.log('✓ Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_mcp_server_owner ON mcp_server(owner_id, owner_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_mcp_server_status ON mcp_server(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_mcp_tool_server ON mcp_tool(server_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_mcp_tool_name ON mcp_tool(tool_name)`;

    // 4. Add timeoutMs field to workflow table
    console.log('✓ Adding timeout_ms field to workflow table...');
    const timeoutMsColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workflow' AND column_name = 'timeout_ms'
    `;

    if (timeoutMsColumn.length === 0) {
      await sql`ALTER TABLE workflow ADD COLUMN timeout_ms INTEGER DEFAULT 300000`;
      console.log('  → Added timeout_ms column (default: 5 minutes)');
    } else {
      console.log('  → timeout_ms column already exists');
    }

    // 5. Verify tables
    console.log('\n📊 Verifying migration...');

    const mcpServerCols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'mcp_server'
      ORDER BY ordinal_position
    `;
    console.log(`  → mcp_server: ${mcpServerCols.length} columns`);

    const mcpToolCols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'mcp_tool'
      ORDER BY ordinal_position
    `;
    console.log(`  → mcp_tool: ${mcpToolCols.length} columns`);

    const workflowTimeoutCheck = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'workflow' AND column_name = 'timeout_ms'
    `;
    if (workflowTimeoutCheck.length > 0) {
      console.log(`  → workflow.timeout_ms: ${workflowTimeoutCheck[0].data_type} (default: ${workflowTimeoutCheck[0].column_default})`);
    }

    console.log('\n✅ MCP system migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('  • mcp_server table created');
    console.log('  • mcp_tool table created');
    console.log('  • 4 indexes created for performance');
    console.log('  • workflow.timeout_ms field added');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

migrate().catch(console.error);
