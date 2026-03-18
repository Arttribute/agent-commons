# OAuth 2.0 System Migration Guide

This guide will help you run the OAuth migration to update your Supabase database with the new OAuth tables.

## Prerequisites

✅ **Already configured in your .env:**
- `DATABASE_URL` - Your Supabase PostgreSQL connection string
- `TOOL_KEY_ENCRYPTION_MASTER` - Master encryption key for secrets

📝 **Optional (for OAuth provider seeding):**
- `GOOGLE_OAUTH_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_OAUTH_CLIENT_SECRET` - Google OAuth client secret
- `GITHUB_OAUTH_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_OAUTH_CLIENT_SECRET` - GitHub OAuth client secret

## What This Migration Does

The `add-oauth-system.mjs` migration will:

1. **Create 3 new tables:**
   - `oauth_provider` - Stores OAuth provider configurations (Google, GitHub, etc.)
   - `oauth_connection` - Stores user OAuth connections with encrypted tokens
   - `oauth_state` - Temporary CSRF protection tokens (auto-cleanup)

2. **Seed platform providers (if credentials are set):**
   - Google Workspace (for Classroom, Drive, Calendar, Gmail)
   - GitHub (for repository access)

3. **Add indexes** for optimal query performance

## Running the Migration

### Step 1: Navigate to the migrations directory
```bash
cd /Users/bashybaranaba/agent-commons/apps/commons-api/migrations
```

### Step 2: Run the migration
```bash
node add-oauth-system.mjs
```

### Step 3: Verify the output
You should see:
```
🔧 Creating OAuth 2.0 system tables...

Creating oauth_provider table...
✓ Created oauth_provider table
✓ Created indexes for oauth_provider

Creating oauth_connection table...
✓ Created oauth_connection table
✓ Created indexes for oauth_connection

Creating oauth_state table...
✓ Created oauth_state table
✓ Created indexes for oauth_state

🌱 Seeding platform OAuth providers...
⚠️  Skipping Google Workspace - missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET
⚠️  Skipping GitHub - missing GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET

📊 Verifying table structures...

oauth_provider columns:
  ✓ provider_id (uuid)
  ✓ provider_key (text)
  ✓ display_name (text)
  ... (and more)

✓ Total OAuth providers: 0

✅ OAuth 2.0 system migration completed successfully!
```

## Setting Up OAuth Providers (Optional)

If you want to enable Google Workspace or GitHub integration, you need to:

### Google Workspace Setup

1. **Create OAuth credentials** at https://console.cloud.google.com/apis/credentials
   - Create a new OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3001/v1/oauth/callback/google_workspace` (adjust for your domain)

2. **Add to .env:**
   ```bash
   GOOGLE_OAUTH_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"
   ```

3. **Re-run the migration** to seed the Google provider:
   ```bash
   node add-oauth-system.mjs
   ```

### GitHub Setup

1. **Create OAuth App** at https://github.com/settings/developers
   - New OAuth App
   - Authorization callback URL: `http://localhost:3001/v1/oauth/callback/github`

2. **Add to .env:**
   ```bash
   GITHUB_OAUTH_CLIENT_ID="your-github-client-id"
   GITHUB_OAUTH_CLIENT_SECRET="your-github-client-secret"
   ```

3. **Re-run the migration** to seed the GitHub provider

## Verification

After running the migration, you can verify the tables were created in Supabase:

### Using Supabase Dashboard:
1. Go to your Supabase project
2. Navigate to **Table Editor**
3. You should see three new tables:
   - `oauth_provider`
   - `oauth_connection`
   - `oauth_state`

### Using SQL:
```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'oauth_%';

-- Check provider count
SELECT COUNT(*) as total_providers FROM oauth_provider;

-- View providers
SELECT provider_key, display_name, is_active
FROM oauth_provider;
```

## Rollback (if needed)

If you need to rollback this migration:

```sql
-- WARNING: This will delete all OAuth data
DROP TABLE IF EXISTS oauth_state CASCADE;
DROP TABLE IF EXISTS oauth_connection CASCADE;
DROP TABLE IF EXISTS oauth_provider CASCADE;
```

## Next Steps

After successful migration:

1. ✅ **Database is ready** - OAuth tables are created
2. 🔧 **Complete backend** - Finish REST API endpoints (Phase 4)
3. 🎨 **Build frontend** - Create OAuth connection UI (Phase 5)
4. 🧪 **Test OAuth flow** - Try connecting a provider

## Troubleshooting

### Error: "TOOL_KEY_ENCRYPTION_MASTER environment variable not set"
- Make sure your .env file has `TOOL_KEY_ENCRYPTION_MASTER` set
- Check that the .env file is in `/Users/bashybaranaba/agent-commons/apps/commons-api/`

### Error: "Cannot connect to database"
- Verify your `DATABASE_URL` is correct
- Check your Supabase project is active
- Ensure your IP is whitelisted in Supabase (if using direct connection)

### Migration runs but providers aren't seeded
- This is expected if OAuth credentials aren't set
- Providers can be added later via the API or by setting credentials and re-running

### Error: "relation already exists"
- The tables already exist (migration ran before)
- Safe to ignore if you're re-running
- Or drop the tables first if you want a clean slate

## Support

For issues or questions:
- Check the implementation plan: `/Users/bashybaranaba/.claude/plans/lovely-hatching-quill.md`
- Review the migration file: `/Users/bashybaranaba/agent-commons/apps/commons-api/migrations/add-oauth-system.mjs`
