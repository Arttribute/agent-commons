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

const providerDefinitions = [
  {
    providerKey: 'google_workspace',
    displayName: 'Google Workspace',
    description: 'Connect to Google Classroom, Gmail, Drive, Calendar, and more Google services',
    logoUrl: 'https://www.gstatic.com/images/branding/product/1x/googleg_48dp.png',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    scopes: {
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
      ],
      docs: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive.file'
      ],
      sheets: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
      ],
      slides: [
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/drive.file'
      ]
    },
    authorizationParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true'
    },
    tokenParams: {}
  },
  {
    providerKey: 'github',
    displayName: 'GitHub',
    description: 'Connect to GitHub for repository access, issues, pull requests, and code context',
    logoUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    revokeUrl: null,
    userInfoUrl: 'https://api.github.com/user',
    clientIdEnv: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GITHUB_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['read:user', 'user:email'],
      repo: ['repo'],
      issues: ['repo'],
      pull_requests: ['repo'],
      workflow: ['workflow'],
      org: ['read:org'],
      gist: ['gist'],
      packages: ['read:packages', 'write:packages']
    },
    authorizationParams: {},
    tokenParams: {}
  },
  {
    providerKey: 'slack',
    displayName: 'Slack',
    description: 'Connect to Slack for workspace messages, channels, files, and team updates',
    logoUrl: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    revokeUrl: 'https://slack.com/api/auth.revoke',
    userInfoUrl: 'https://slack.com/api/auth.test',
    clientIdEnv: 'SLACK_OAUTH_CLIENT_ID',
    clientSecretEnv: 'SLACK_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['channels:read', 'chat:write'],
      messages: ['channels:history', 'groups:history', 'im:history', 'mpim:history'],
      files: ['files:read', 'files:write'],
      users: ['users:read', 'users:read.email'],
      commands: ['commands']
    },
    authorizationParams: {},
    tokenParams: {}
  },
  {
    providerKey: 'canva',
    displayName: 'Canva',
    description: 'Connect to Canva to create, read, and export designs through Canva Connect APIs',
    logoUrl: 'https://static.canva.com/static/images/favicon-1.ico',
    authUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    revokeUrl: 'https://api.canva.com/rest/v1/oauth/revoke',
    userInfoUrl: 'https://api.canva.com/rest/v1/users/me/profile',
    clientIdEnv: 'CANVA_OAUTH_CLIENT_ID',
    clientSecretEnv: 'CANVA_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['profile:read', 'design:meta:read'],
      designs: [
        'profile:read',
        'design:meta:read',
        'design:content:read',
        'design:content:write'
      ],
      assets: ['asset:read', 'asset:write'],
      folders: ['folder:read', 'folder:write']
    },
    authorizationParams: {},
    tokenParams: {}
  },
  {
    providerKey: 'x',
    displayName: 'X (Twitter)',
    description: 'Connect an X account for approved read, search, publish, reply, quote, and delete actions',
    logoUrl: 'https://abs.twimg.com/favicons/twitter.3.ico',
    authUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    revokeUrl: null,
    userInfoUrl: 'https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url',
    clientIdEnv: 'X_OAUTH_CLIENT_ID',
    clientSecretEnv: 'X_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['tweet.read', 'users.read', 'offline.access'],
      publish: ['tweet.read', 'tweet.write', 'users.read', 'offline.access']
    },
    authorizationParams: {},
    tokenParams: {}
  }
];

async function upsertOAuthProvider(provider) {
  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];
  const hasCredentials = Boolean(clientId && clientSecret);
  const existing = await sql`
    SELECT provider_id FROM oauth_provider WHERE provider_key = ${provider.providerKey}
  `;

  if (existing.length === 0 && !hasCredentials) {
    console.log(
      `⚠️  Skipping ${provider.displayName} - missing ${provider.clientIdEnv} or ${provider.clientSecretEnv}`
    );
    return 'skipped';
  }

  if (existing.length === 0) {
    console.log(`Seeding ${provider.displayName} provider...`);
    const encryptedSecret = encrypt(clientSecret);

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
        ${provider.providerKey},
        ${provider.displayName},
        ${provider.description},
        ${provider.logoUrl},
        ${provider.authUrl},
        ${provider.tokenUrl},
        ${provider.revokeUrl},
        ${provider.userInfoUrl},
        ${clientId},
        ${encryptedSecret.encryptedValue},
        ${encryptedSecret.iv},
        ${encryptedSecret.tag},
        ${sql.json(provider.scopes)},
        ${sql.json(provider.authorizationParams ?? {})},
        ${sql.json(provider.tokenParams ?? {})},
        true,
        true
      )
    `;
    console.log(`✓ Seeded ${provider.displayName} provider`);
    return 'seeded';
  }

  if (hasCredentials) {
    console.log(`Updating ${provider.displayName} provider and credentials...`);
    const encryptedSecret = encrypt(clientSecret);

    await sql`
      UPDATE oauth_provider
      SET
        display_name = ${provider.displayName},
        description = ${provider.description},
        logo_url = ${provider.logoUrl},
        auth_url = ${provider.authUrl},
        token_url = ${provider.tokenUrl},
        revoke_url = ${provider.revokeUrl},
        user_info_url = ${provider.userInfoUrl},
        client_id = ${clientId},
        encrypted_client_secret = ${encryptedSecret.encryptedValue},
        secret_iv = ${encryptedSecret.iv},
        secret_tag = ${encryptedSecret.tag},
        scopes = ${sql.json(provider.scopes)},
        authorization_params = ${sql.json(provider.authorizationParams ?? {})},
        token_params = ${sql.json(provider.tokenParams ?? {})},
        is_active = true,
        is_platform = true,
        updated_at = timezone('utc', now())
      WHERE provider_key = ${provider.providerKey}
    `;
    console.log(`✓ Updated ${provider.displayName} provider`);
    return 'updated';
  }

  console.log(`Updating ${provider.displayName} provider metadata (credentials unchanged)...`);
  await sql`
    UPDATE oauth_provider
    SET
      display_name = ${provider.displayName},
      description = ${provider.description},
      logo_url = ${provider.logoUrl},
      auth_url = ${provider.authUrl},
      token_url = ${provider.tokenUrl},
      revoke_url = ${provider.revokeUrl},
      user_info_url = ${provider.userInfoUrl},
      scopes = ${sql.json(provider.scopes)},
      authorization_params = ${sql.json(provider.authorizationParams ?? {})},
      token_params = ${sql.json(provider.tokenParams ?? {})},
      is_platform = true,
      updated_at = timezone('utc', now())
    WHERE provider_key = ${provider.providerKey}
  `;
  console.log(`✓ Updated ${provider.displayName} provider metadata`);
  return 'updated_metadata';
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
    const seedResults = {};
    for (const provider of providerDefinitions) {
      const result = await upsertOAuthProvider(provider);
      seedResults[result] = (seedResults[result] || 0) + 1;
    }
    console.log(
      `✓ Provider seed summary: ${Object.entries(seedResults)
        .map(([status, count]) => `${status}=${count}`)
        .join(', ')}`
    );

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
    console.log('   1. Set *_OAUTH_CLIENT_ID and *_OAUTH_CLIENT_SECRET for each provider you want active');
    console.log('      Supported prefixes: GOOGLE, GITHUB, SLACK, CANVA');
    console.log('   2. Configure each provider redirect URL as <frontend-origin>/api/oauth/callback/<provider_key>');
    console.log('      Example: http://localhost:3000/api/oauth/callback/github');
    console.log('   3. Rerun this migration whenever OAuth client credentials or provider scopes change\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

migrate().catch(console.error);
