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
- `SLACK_OAUTH_CLIENT_ID` - Slack OAuth client ID
- `SLACK_OAUTH_CLIENT_SECRET` - Slack OAuth client secret
- `CANVA_OAUTH_CLIENT_ID` - Canva OAuth client ID
- `CANVA_OAUTH_CLIENT_SECRET` - Canva OAuth client secret

## What This Migration Does

The `add-oauth-system.mjs` migration will:

1. **Create 3 new tables:**
   - `oauth_provider` - Stores OAuth provider configurations (Google, GitHub, etc.)
   - `oauth_connection` - Stores user OAuth connections with encrypted tokens
   - `oauth_state` - Temporary CSRF protection tokens (auto-cleanup)

2. **Seed platform providers (if credentials are set):**
   - Google Workspace (for Classroom, Drive, Calendar, Gmail)
   - GitHub (for repository access)
   - Slack (for channels, messages, and workspace updates)
   - Canva (for Canva Connect APIs)

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
⚠️  Skipping Slack - missing SLACK_OAUTH_CLIENT_ID or SLACK_OAUTH_CLIENT_SECRET
⚠️  Skipping Canva - missing CANVA_OAUTH_CLIENT_ID or CANVA_OAUTH_CLIENT_SECRET

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

If you want to enable Google Workspace, GitHub, Slack, or Canva integration, you need to create provider credentials and configure the redirect URL as:

```text
<frontend-origin>/api/oauth/callback/<provider_key>
```

For local development, the frontend origin is usually `http://localhost:3000`.

### Google Workspace Setup

1. **Create OAuth credentials** at https://console.cloud.google.com/apis/credentials
   - Create a new OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/oauth/callback/google_workspace` (adjust for your domain)

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
   - Authorization callback URL: `http://localhost:3000/api/oauth/callback/github`

2. **Add to .env:**
   ```bash
   GITHUB_OAUTH_CLIENT_ID="your-github-client-id"
   GITHUB_OAUTH_CLIENT_SECRET="your-github-client-secret"
   ```

3. **Re-run the migration** to seed the GitHub provider

### Slack Setup

1. **Create a Slack app** at https://api.slack.com/apps
   - Configure OAuth & Permissions
   - Redirect URL: `<frontend-origin>/api/oauth/callback/slack`
   - Slack requires HTTPS redirect URLs, so use your deployed frontend URL or an HTTPS tunnel for local testing

2. **Add to .env:**
   ```bash
   SLACK_OAUTH_CLIENT_ID="your-slack-client-id"
   SLACK_OAUTH_CLIENT_SECRET="your-slack-client-secret"
   ```

3. **Re-run the migration** to seed the Slack provider

### Canva Setup

1. **Create a Canva integration** at https://www.canva.com/developers/integrations
   - Configure authentication redirect URL: `http://localhost:3000/api/oauth/callback/canva`
   - Enable the scopes needed by your app, such as `profile:read`, `design:meta:read`, `design:content:read`, and `design:content:write`

2. **Add to .env:**
   ```bash
   CANVA_OAUTH_CLIENT_ID="your-canva-client-id"
   CANVA_OAUTH_CLIENT_SECRET="your-canva-client-secret"
   ```

3. **Re-run the migration** to seed the Canva provider

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
2. 🔧 **Set provider credentials** - Add env vars for the providers you want active
3. 🧪 **Test OAuth flow** - Try connecting each provider from `/studio/tools`

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

## Follow-up migrations (Google Workspace tools)

Run these SQL files against the same database after `add-oauth-system.mjs`:

1. `add-google-workspace-tools.sql` — seeds the read-oriented Google tools
   (calendar list/create, gmail search/get, drive search, sheets read) and
   extends the `google_workspace` provider scopes for Sheets.
2. `add-google-workspace-send-tools.sql` — seeds `google_gmail_send_message`
   (email sending via the `gmailRawMessage` body transform) and
   `google_calendar_list_calendars`, and adds the Gmail send/read scopes to
   the provider's scope groups.

Notes for production:

- **Per-agent enablement is required.** OAuth-backed tools are no longer
  implicitly available to every agent. Each agent must have an enabled
  `agent_tool` assignment (Studio → Agents → Tools → connect the Google app
  to the agent).
- **Users must also connect their Google account** (Studio → Tools, or
  `agc connections connect google_workspace`). Both the account connection
  and the per-agent assignment are needed before the tools work.
- Set `APP_ORIGIN` in the API `.env` to the web app origin so CLI/SDK-initiated
  OAuth flows build the redirect URI that is registered with Google.
- Set `API_SECRET_KEY` (already required for management auth) — it now also
  protects the internal tool-execution endpoint `POST /v1/agents/tools`.

## Schema-drift repair migrations (2026-07-10, applied to shared DB)

- `fix-agent-tool-table.sql` — the production `agent_tool` table was missing
  `is_enabled`/`config`/`updated_at`, carried a legacy `"toolId"` column, and
  had `tool_id` as text. Assigning a tool to an agent 500'd. Now aligned with
  `models/schema.ts` plus a unique `(agent_id, tool_id)` index so re-adding a
  tool upserts.
- `fix-tool-execution-log-table.sql` — production had an older variant of
  `tool_execution_log`; every execution-log insert failed silently. Recreated
  to match the schema.

## Google Cloud project requirements

The OAuth client's GCP project must have the product APIs enabled or every
call fails with 403 regardless of granted scopes:
Gmail API, Google Calendar API, Google Drive API, Google Sheets API —
enable at https://console.developers.google.com/apis (project 848878149972).
