#!/usr/bin/env node

import postgres from 'postgres';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomBytes, createCipheriv } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL);

// Simple encryption function for seeding provider secrets
function encrypt(text) {
  const masterKey = process.env.TOOL_KEY_ENCRYPTION_MASTER;
  if (!masterKey) {
    throw new Error('TOOL_KEY_ENCRYPTION_MASTER environment variable not set');
  }

  // Convert master key to buffer (hex format)
  let keyBuffer;
  if (masterKey.length === 64) {
    // Hex format (32 bytes = 64 hex chars)
    keyBuffer = Buffer.from(masterKey, 'hex');
  } else if (masterKey.length === 44) {
    // Base64 format
    keyBuffer = Buffer.from(masterKey, 'base64');
  } else {
    throw new Error('Invalid master key format. Expected 64-char hex or 44-char base64');
  }

  if (keyBuffer.length !== 32) {
    throw new Error('Master key must be 32 bytes (256 bits)');
  }

  // Generate random IV (12 bytes for GCM)
  const iv = randomBytes(12);

  // Create cipher
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);

  // Encrypt
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted,
    iv: iv.toString('hex'),
    tag: authTag.toString('hex')
  };
}

async function migrate() {
  console.log('🔧 Creating OAuth 2.0 system tables...\n');

  try {
    // Enable UUID extension if not already enabled
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    // ========== Create oauth_provider table ==========
    console.log('Creating oauth_provider table...');
    await sql`
      CREATE TABLE IF NOT EXISTS oauth_provider (
        provider_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

        -- Identity
        provider_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,

        -- OAuth Configuration
        auth_url TEXT NOT NULL,
        token_url TEXT NOT NULL,
        revoke_url TEXT,
        user_info_url TEXT,

        -- Encrypted Client Credentials
        client_id TEXT NOT NULL,
        encrypted_client_secret TEXT NOT NULL,
        secret_iv TEXT NOT NULL,
        secret_tag TEXT NOT NULL,

        -- Configuration
        scopes JSONB NOT NULL DEFAULT '{}',
        authorization_params JSONB DEFAULT '{}',
        token_params JSONB DEFAULT '{}',

        -- Metadata
        is_active BOOLEAN DEFAULT true,
        is_platform BOOLEAN DEFAULT true,
        owner_id TEXT,
        owner_type TEXT,

        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
      )
    `;
    console.log('✓ Created oauth_provider table');

    // Create indexes for oauth_provider
    await sql`CREATE INDEX IF NOT EXISTS idx_oauth_provider_key ON oauth_provider(provider_key)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_oauth_provider_active ON oauth_provider(is_active)`;
    console.log('✓ Created indexes for oauth_provider');

    // ========== Create oauth_connection table ==========
    console.log('\nCreating oauth_connection table...');
    await sql`
      CREATE TABLE IF NOT EXISTS oauth_connection (
        connection_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

        -- Ownership
        owner_id TEXT NOT NULL,
        owner_type TEXT NOT NULL,

        -- Provider Reference
        provider_id UUID NOT NULL REFERENCES oauth_provider(provider_id) ON DELETE CASCADE,

        -- Encrypted Access Token
        encrypted_access_token TEXT NOT NULL,
        access_token_iv TEXT NOT NULL,
        access_token_tag TEXT NOT NULL,
        access_token_expires_at TIMESTAMP WITH TIME ZONE,

        -- Encrypted Refresh Token
        encrypted_refresh_token TEXT NOT NULL,
        refresh_token_iv TEXT NOT NULL,
        refresh_token_tag TEXT NOT NULL,

        -- Optional ID Token (OIDC)
        encrypted_id_token TEXT,
        id_token_iv TEXT,
        id_token_tag TEXT,

        -- Scopes
        scopes TEXT[] NOT NULL DEFAULT '{}',

        -- Provider User Info
        provider_user_id TEXT,
        provider_user_email TEXT,
        provider_user_name TEXT,
        provider_metadata JSONB DEFAULT '{}',

        -- Status & Tracking
        status TEXT DEFAULT 'active',
        last_refreshed_at TIMESTAMP WITH TIME ZONE,
        last_used_at TIMESTAMP WITH TIME ZONE,
        usage_count INTEGER DEFAULT 0,
        last_error TEXT,
        last_error_at TIMESTAMP WITH TIME ZONE,

        -- User Labels
        display_name TEXT,
        description TEXT,

        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,

        -- Constraints
        UNIQUE(owner_id, owner_type, provider_id)
      )
    `;
    console.log('✓ Created oauth_connection table');

    // Create indexes for oauth_connection
    await sql`CREATE INDEX IF NOT EXISTS idx_oauth_connection_owner ON oauth_connection(owner_id, owner_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_oauth_connection_provider ON oauth_connection(provider_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_oauth_connection_status ON oauth_connection(status)`;
    console.log('✓ Created indexes for oauth_connection');

    // ========== Create oauth_state table ==========
    console.log('\nCreating oauth_state table...');
    await sql`
      CREATE TABLE IF NOT EXISTS oauth_state (
        state_id TEXT PRIMARY KEY,

        -- Context
        owner_id TEXT NOT NULL,
        provider_id UUID NOT NULL REFERENCES oauth_provider(provider_id) ON DELETE CASCADE,

        -- PKCE (optional)
        code_verifier TEXT,

        -- Redirect Context
        redirect_uri TEXT NOT NULL,
        requested_scopes TEXT[] NOT NULL DEFAULT '{}',

        -- Security
        user_agent TEXT,
        ip_address TEXT,

        -- Expiry
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,

        CHECK (expires_at > created_at)
      )
    `;
    console.log('✓ Created oauth_state table');

    // Create indexes for oauth_state
    await sql`CREATE INDEX IF NOT EXISTS idx_oauth_state_expiry ON oauth_state(expires_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_oauth_state_owner ON oauth_state(owner_id)`;
    console.log('✓ Created indexes for oauth_state');

    // ========== Seed Platform Providers ==========
    console.log('\n🌱 Seeding platform OAuth providers...');

    // Check if Google Workspace provider already exists
    const existingGoogle = await sql`
      SELECT provider_id FROM oauth_provider WHERE provider_key = 'google_workspace'
    `;

    if (existingGoogle.length === 0 && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
      console.log('Seeding Google Workspace provider...');
      const googleSecret = encrypt(process.env.GOOGLE_OAUTH_CLIENT_SECRET);

      await sql`
        INSERT INTO oauth_provider (
          provider_key,
          display_name,
          description,
          logo_url,
          auth_url,
          token_url,
          revoke_url,
          user_info_url,
          client_id,
          encrypted_client_secret,
          secret_iv,
          secret_tag,
          scopes,
          authorization_params,
          token_params,
          is_active,
          is_platform
        ) VALUES (
          'google_workspace',
          'Google Workspace',
          'Connect to Google Classroom, Gmail, Drive, Calendar, and more Google services',
          'https://www.gstatic.com/images/branding/product/1x/googleg_48dp.png',
          'https://accounts.google.com/o/oauth2/v2/auth',
          'https://oauth2.googleapis.com/token',
          'https://oauth2.googleapis.com/revoke',
          'https://www.googleapis.com/oauth2/v2/userinfo',
          ${process.env.GOOGLE_OAUTH_CLIENT_ID},
          ${googleSecret.encryptedValue},
          ${googleSecret.iv},
          ${googleSecret.tag},
          ${JSON.stringify({
            default: ['openid', 'email', 'profile'],
            classroom: [
              'https://www.googleapis.com/auth/classroom.courses.readonly',
              'https://www.googleapis.com/auth/classroom.announcements',
              'https://www.googleapis.com/auth/classroom.coursework.students',
              'https://www.googleapis.com/auth/classroom.coursework.me',
              'https://www.googleapis.com/auth/classroom.rosters.readonly',
              'https://www.googleapis.com/auth/classroom.push-notifications'
            ],
            drive: [
              'https://www.googleapis.com/auth/drive.readonly',
              'https://www.googleapis.com/auth/drive.file'
            ],
            calendar: [
              'https://www.googleapis.com/auth/calendar.readonly',
              'https://www.googleapis.com/auth/calendar.events'
            ],
            gmail: [
              'https://www.googleapis.com/auth/gmail.readonly',
              'https://www.googleapis.com/auth/gmail.send'
            ]
          })},
          ${JSON.stringify({
            access_type: 'offline',
            prompt: 'consent',
            include_granted_scopes: 'true'
          })},
          '{}',
          true,
          true
        )
      `;
      console.log('✓ Seeded Google Workspace provider');
    } else if (existingGoogle.length > 0) {
      console.log('✓ Google Workspace provider already exists');
    } else {
      console.log('⚠️  Skipping Google Workspace - missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET');
    }

    // Check if GitHub provider already exists
    const existingGithub = await sql`
      SELECT provider_id FROM oauth_provider WHERE provider_key = 'github'
    `;

    if (existingGithub.length === 0 && process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET) {
      console.log('Seeding GitHub provider...');
      const githubSecret = encrypt(process.env.GITHUB_OAUTH_CLIENT_SECRET);

      await sql`
        INSERT INTO oauth_provider (
          provider_key,
          display_name,
          description,
          logo_url,
          auth_url,
          token_url,
          revoke_url,
          user_info_url,
          client_id,
          encrypted_client_secret,
          secret_iv,
          secret_tag,
          scopes,
          authorization_params,
          is_active,
          is_platform
        ) VALUES (
          'github',
          'GitHub',
          'Connect to GitHub for repository access, issues, pull requests, and more',
          'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
          'https://github.com/login/oauth/authorize',
          'https://github.com/login/oauth/access_token',
          NULL,
          'https://api.github.com/user',
          ${process.env.GITHUB_OAUTH_CLIENT_ID},
          ${githubSecret.encryptedValue},
          ${githubSecret.iv},
          ${githubSecret.tag},
          ${JSON.stringify({
            default: ['user', 'user:email'],
            repo: ['repo', 'repo:status', 'repo_deployment'],
            workflow: ['workflow'],
            write: ['write:discussion', 'write:packages'],
            read: ['read:org', 'read:user', 'read:project']
          })},
          '{}',
          true,
          true
        )
      `;
      console.log('✓ Seeded GitHub provider');
    } else if (existingGithub.length > 0) {
      console.log('✓ GitHub provider already exists');
    } else {
      console.log('⚠️  Skipping GitHub - missing GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET');
    }

    // ========== Verify Tables ==========
    console.log('\n📊 Verifying table structures...');

    const providerColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'oauth_provider'
      ORDER BY ordinal_position
    `;
    console.log('\noauth_provider columns:');
    providerColumns.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type})`);
    });

    const connectionColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'oauth_connection'
      ORDER BY ordinal_position
    `;
    console.log('\noauth_connection columns:');
    connectionColumns.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type})`);
    });

    const stateColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'oauth_state'
      ORDER BY ordinal_position
    `;
    console.log('\noauth_state columns:');
    stateColumns.forEach(col => {
      console.log(`  ✓ ${col.column_name} (${col.data_type})`);
    });

    // Count providers
    const providerCount = await sql`SELECT COUNT(*) as count FROM oauth_provider`;
    console.log(`\n✓ Total OAuth providers: ${providerCount[0].count}`);

    console.log('\n✅ OAuth 2.0 system migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET for Google integration');
    console.log('   2. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET for GitHub integration');
    console.log('   3. Implement OAuth services (Provider, Connection, Flow, TokenInjection)');
    console.log('   4. Create OAuth controller and endpoints');
    console.log('   5. Build frontend OAuth UI\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

migrate().catch(console.error);
