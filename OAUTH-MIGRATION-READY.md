# 🚀 OAuth 2.0 System - Migration Ready

## ✅ What's Been Completed

### Database Schema ✓
- **Main schema updated**: [apps/commons-api/models/schema.ts](apps/commons-api/models/schema.ts)
  - Added `oauthProvider` table (lines 1048-1094)
  - Added `oauthConnection` table (lines 1102-1168)
  - Added `oauthState` table (lines 1176-1207)
  - Added relations (lines 1211-1231)

### Migration File ✓
- **Migration script**: [apps/commons-api/migrations/add-oauth-system.mjs](apps/commons-api/migrations/add-oauth-system.mjs)
  - Creates 3 OAuth tables with proper indexes
  - Seeds Google Workspace and GitHub providers (if credentials are set)
  - Includes encryption for client secrets
  - Executable and ready to run

### Environment Configuration ✓
- **Updated .env.example**: [apps/commons-api/.env.example](apps/commons-api/.env.example)
  - Added `TOOL_KEY_ENCRYPTION_MASTER` (required)
  - Added `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` (optional)
  - Added `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` (optional)

### Documentation ✓
- **Migration guide**: [apps/commons-api/migrations/README-OAUTH-MIGRATION.md](apps/commons-api/migrations/README-OAUTH-MIGRATION.md)
  - Step-by-step instructions
  - OAuth provider setup guides
  - Troubleshooting section
  - Verification steps

---

## 🎯 Running the Migration (3 Steps)

### Step 1: Verify Prerequisites
Your .env already has:
- ✅ `DATABASE_URL` - Connected to Supabase
- ✅ `TOOL_KEY_ENCRYPTION_MASTER` - Set for encryption

### Step 2: Run the Migration
```bash
cd apps/commons-api/migrations
node add-oauth-system.mjs
```

### Step 3: Verify in Supabase
1. Go to your Supabase Dashboard
2. Navigate to **Table Editor**
3. Confirm 3 new tables exist:
   - `oauth_provider`
   - `oauth_connection`
   - `oauth_state`

---

## 📊 Database Schema Overview

### Table: `oauth_provider`
**Purpose**: Stores OAuth provider configurations (Google, GitHub, Slack, etc.)

**Key columns**:
- `provider_id` (UUID, PK)
- `provider_key` (TEXT, unique) - e.g., 'google_workspace', 'github'
- `display_name` (TEXT) - e.g., 'Google Workspace'
- `auth_url`, `token_url`, `revoke_url`, `user_info_url` (TEXT)
- `client_id` (TEXT)
- `encrypted_client_secret`, `secret_iv`, `secret_tag` (TEXT) - AES-256-GCM encrypted
- `scopes` (JSONB) - Available OAuth scopes
- `is_active`, `is_platform` (BOOLEAN)

**Indexes**:
- `idx_oauth_provider_key` on `provider_key`
- `idx_oauth_provider_active` on `is_active`

---

### Table: `oauth_connection`
**Purpose**: Stores user OAuth connections with encrypted access/refresh tokens

**Key columns**:
- `connection_id` (UUID, PK)
- `owner_id` (TEXT) - User wallet address
- `owner_type` (TEXT) - 'user' | 'agent'
- `provider_id` (UUID, FK → oauth_provider)
- `encrypted_access_token`, `access_token_iv`, `access_token_tag` (TEXT)
- `access_token_expires_at` (TIMESTAMP)
- `encrypted_refresh_token`, `refresh_token_iv`, `refresh_token_tag` (TEXT)
- `scopes` (TEXT[]) - Granted OAuth scopes
- `status` (TEXT) - 'active' | 'expired' | 'revoked' | 'error'
- `usage_count` (INTEGER), `last_used_at` (TIMESTAMP)

**Indexes**:
- `idx_oauth_connection_owner` on `(owner_id, owner_type)`
- `idx_oauth_connection_provider` on `provider_id`
- `idx_oauth_connection_status` on `status`

**Unique constraint**: `(owner_id, owner_type, provider_id)` - One connection per user per provider

---

### Table: `oauth_state`
**Purpose**: Temporary CSRF protection tokens (10-minute expiry)

**Key columns**:
- `state_id` (TEXT, PK) - Random UUID
- `owner_id` (TEXT) - User wallet address
- `provider_id` (UUID, FK → oauth_provider)
- `redirect_uri` (TEXT)
- `requested_scopes` (TEXT[])
- `expires_at` (TIMESTAMP) - 10 minutes from creation
- `user_agent`, `ip_address` (TEXT) - Security tracking

**Indexes**:
- `idx_oauth_state_expiry` on `expires_at`
- `idx_oauth_state_owner` on `owner_id`

**Note**: States are automatically deleted after use (one-time CSRF tokens)

---

## 🔐 Security Features

### Encryption
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Master Key**: From `TOOL_KEY_ENCRYPTION_MASTER` environment variable
- **Per-token encryption**: Each token has unique IV and authentication tag
- **No plaintext storage**: All sensitive data encrypted at rest

### CSRF Protection
- Random state tokens for OAuth flows
- Short expiry (10 minutes)
- One-time use (deleted after validation)
- User agent and IP tracking

### Connection Resolution Priority
When a tool needs OAuth:
1. **Session initiator's connection** (user who started conversation)
2. **Agent owner's connection** (fallback)
3. **Error if none found** (prompts user to connect)

---

## 🧪 Testing the Migration

### After running the migration, test with SQL:

```sql
-- Check tables exist
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_name LIKE 'oauth_%'
ORDER BY table_name;

-- Should return:
-- oauth_connection | BASE TABLE
-- oauth_provider   | BASE TABLE
-- oauth_state      | BASE TABLE

-- Check indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname LIKE 'idx_oauth_%'
ORDER BY tablename, indexname;

-- Check provider count (will be 0 if no OAuth credentials set)
SELECT COUNT(*) as total_providers FROM oauth_provider;

-- View provider structure (empty initially)
SELECT
  provider_key,
  display_name,
  is_active,
  is_platform,
  created_at
FROM oauth_provider;
```

---

## 🎨 Example: Seeding Google Workspace (Optional)

If you want to add Google Workspace support immediately:

### 1. Get OAuth Credentials
- Go to https://console.cloud.google.com/apis/credentials
- Create OAuth 2.0 Client ID
- Set redirect URI: `http://localhost:3001/v1/oauth/callback/google_workspace`

### 2. Add to .env
```bash
GOOGLE_OAUTH_CLIENT_ID="123456789-abc.apps.googleusercontent.com"
GOOGLE_OAUTH_CLIENT_SECRET="GOCSPX-your_secret_here"
```

### 3. Re-run Migration
```bash
cd apps/commons-api/migrations
node add-oauth-system.mjs
```

The migration will detect the credentials and seed the Google Workspace provider with scopes for:
- Google Classroom
- Google Drive
- Google Calendar
- Gmail

---

## 📝 Schema Changes Summary

**New tables**: 3
- `oauth_provider`
- `oauth_connection`
- `oauth_state`

**New indexes**: 6
- 2 on `oauth_provider`
- 3 on `oauth_connection`
- 2 on `oauth_state`

**New relations**: 3
- `oauth_connection` → `oauth_provider` (many-to-one)
- `oauth_state` → `oauth_provider` (many-to-one)

**Breaking changes**: None (all new tables)

---

## ⚠️ Important Notes

1. **The migration is idempotent**: Safe to run multiple times
   - Existing tables won't be affected
   - Will skip if tables already exist

2. **Provider seeding is optional**:
   - Without OAuth credentials, tables are created empty
   - Providers can be added later via API

3. **No data loss risk**:
   - All new tables (no existing data affected)
   - No changes to existing tables

4. **Rollback available**:
   - See migration guide for rollback SQL
   - Only needed if you want to completely remove OAuth system

---

## 🚦 Next Steps After Migration

Once the migration completes successfully:

### Immediate (Verify)
- [ ] Check Supabase: Confirm 3 tables exist
- [ ] Run test SQL queries
- [ ] Verify no errors in migration output

### Short-term (Complete Backend)
- [ ] Phase 4: REST API endpoints (DTOs, Controller, Module)
- [ ] Test OAuth flow with curl/Postman

### Long-term (Full Integration)
- [ ] Phase 5: Frontend OAuth UI
- [ ] Connect real OAuth providers
- [ ] Create OAuth-enabled tools (e.g., Google Classroom)

---

## 📞 Support

**Migration file**: `apps/commons-api/migrations/add-oauth-system.mjs`
**Migration guide**: `apps/commons-api/migrations/README-OAUTH-MIGRATION.md`
**Implementation plan**: `.claude/plans/lovely-hatching-quill.md`

For issues, check the troubleshooting section in README-OAUTH-MIGRATION.md
