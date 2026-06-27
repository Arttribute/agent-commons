-- Seed first-party Google Workspace tools for Agent Commons agents.
-- These are platform-owned tool definitions that rely on the existing
-- google_workspace OAuth provider and OAuth token injection pipeline.

INSERT INTO tool (
  tool_id,
  name,
  display_name,
  description,
  schema,
  api_spec,
  visibility,
  owner_type,
  category,
  tags,
  icon,
  version
) VALUES
(
  '11111111-1111-4111-8111-111111111111',
  'google_calendar_list_events',
  'Google Calendar: list events',
  'Lists events from an authorized Google Calendar within an optional time window.',
  '{
    "type": "function",
    "function": {
      "name": "google_calendar_list_events",
      "description": "List events from the user''s Google Calendar.",
      "parameters": {
        "type": "object",
        "properties": {
          "timeMin": { "type": "string", "description": "Optional RFC3339 start time." },
          "timeMax": { "type": "string", "description": "Optional RFC3339 end time." },
          "maxResults": { "type": "integer", "description": "Maximum number of events to return.", "default": 10 }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://www.googleapis.com",
    "path": "/calendar/v3/calendars/primary/events",
    "method": "GET",
    "queryParams": {
      "timeMin": "{timeMin}",
      "timeMax": "{timeMax}",
      "maxResults": "{maxResults}",
      "singleEvents": "true",
      "orderBy": "startTime"
    },
    "authType": "oauth2",
    "oauthProviderKey": "google_workspace"
  }'::jsonb,
  'platform',
  'platform',
  'calendar',
  '["google", "calendar", "oauth2", "platform"]'::jsonb,
  'google-calendar',
  '1.0.0'
),
(
  '11111111-1111-4111-8111-111111111112',
  'google_calendar_create_event',
  'Google Calendar: create event',
  'Creates an event in an authorized Google Calendar.',
  '{
    "type": "function",
    "function": {
      "name": "google_calendar_create_event",
      "description": "Create an event in the user''s Google Calendar.",
      "parameters": {
        "type": "object",
        "required": ["summary", "startDateTime", "endDateTime"],
        "properties": {
          "summary": { "type": "string", "description": "Event title." },
          "description": { "type": "string", "description": "Optional event description." },
          "location": { "type": "string", "description": "Optional event location." },
          "startDateTime": { "type": "string", "description": "RFC3339 start date-time." },
          "endDateTime": { "type": "string", "description": "RFC3339 end date-time." },
          "timeZone": { "type": "string", "description": "IANA time zone.", "default": "UTC" }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://www.googleapis.com",
    "path": "/calendar/v3/calendars/primary/events",
    "method": "POST",
    "bodyTemplate": {
      "summary": "{summary}",
      "description": "{description}",
      "location": "{location}",
      "start": { "dateTime": "{startDateTime}", "timeZone": "{timeZone}" },
      "end": { "dateTime": "{endDateTime}", "timeZone": "{timeZone}" }
    },
    "authType": "oauth2",
    "oauthProviderKey": "google_workspace"
  }'::jsonb,
  'platform',
  'platform',
  'calendar',
  '["google", "calendar", "oauth2", "platform"]'::jsonb,
  'google-calendar',
  '1.0.0'
),
(
  '11111111-1111-4111-8111-111111111113',
  'google_gmail_search_messages',
  'Gmail: search messages',
  'Searches Gmail messages using Gmail search syntax.',
  '{
    "type": "function",
    "function": {
      "name": "google_gmail_search_messages",
      "description": "Search the user''s Gmail messages.",
      "parameters": {
        "type": "object",
        "required": ["q"],
        "properties": {
          "q": { "type": "string", "description": "Gmail search query." },
          "maxResults": { "type": "integer", "description": "Maximum number of messages to return.", "default": 10 }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://gmail.googleapis.com",
    "path": "/gmail/v1/users/me/messages",
    "method": "GET",
    "queryParams": { "q": "{q}", "maxResults": "{maxResults}" },
    "authType": "oauth2",
    "oauthProviderKey": "google_workspace"
  }'::jsonb,
  'platform',
  'platform',
  'email',
  '["google", "gmail", "oauth2", "platform"]'::jsonb,
  'gmail',
  '1.0.0'
),
(
  '11111111-1111-4111-8111-111111111114',
  'google_gmail_get_message',
  'Gmail: get message',
  'Reads a Gmail message by id.',
  '{
    "type": "function",
    "function": {
      "name": "google_gmail_get_message",
      "description": "Read a Gmail message by id.",
      "parameters": {
        "type": "object",
        "required": ["messageId"],
        "properties": {
          "messageId": { "type": "string", "description": "Gmail message id." },
          "format": { "type": "string", "enum": ["metadata", "full", "minimal", "raw"], "default": "metadata" }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://gmail.googleapis.com",
    "path": "/gmail/v1/users/me/messages/{messageId}",
    "method": "GET",
    "queryParams": { "format": "{format}" },
    "authType": "oauth2",
    "oauthProviderKey": "google_workspace"
  }'::jsonb,
  'platform',
  'platform',
  'email',
  '["google", "gmail", "oauth2", "platform"]'::jsonb,
  'gmail',
  '1.0.0'
),
(
  '11111111-1111-4111-8111-111111111115',
  'google_drive_search_files',
  'Google Drive: search files',
  'Searches files in Google Drive.',
  '{
    "type": "function",
    "function": {
      "name": "google_drive_search_files",
      "description": "Search the user''s Google Drive files.",
      "parameters": {
        "type": "object",
        "required": ["q"],
        "properties": {
          "q": { "type": "string", "description": "Google Drive files.list query." },
          "pageSize": { "type": "integer", "default": 10 }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://www.googleapis.com",
    "path": "/drive/v3/files",
    "method": "GET",
    "queryParams": {
      "q": "{q}",
      "pageSize": "{pageSize}",
      "fields": "files(id,name,mimeType,webViewLink,modifiedTime)"
    },
    "authType": "oauth2",
    "oauthProviderKey": "google_workspace"
  }'::jsonb,
  'platform',
  'platform',
  'files',
  '["google", "drive", "oauth2", "platform"]'::jsonb,
  'google-drive',
  '1.0.0'
),
(
  '11111111-1111-4111-8111-111111111116',
  'google_sheets_get_values',
  'Google Sheets: get values',
  'Reads values from a Google Sheets range.',
  '{
    "type": "function",
    "function": {
      "name": "google_sheets_get_values",
      "description": "Read values from a Google Sheets spreadsheet range.",
      "parameters": {
        "type": "object",
        "required": ["spreadsheetId", "range"],
        "properties": {
          "spreadsheetId": { "type": "string" },
          "range": { "type": "string", "description": "A1 notation range, for example Sheet1!A1:D20." }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://sheets.googleapis.com",
    "path": "/v4/spreadsheets/{spreadsheetId}/values/{range}",
    "method": "GET",
    "authType": "oauth2",
    "oauthProviderKey": "google_workspace"
  }'::jsonb,
  'platform',
  'platform',
  'spreadsheet',
  '["google", "sheets", "oauth2", "platform"]'::jsonb,
  'google-sheets',
  '1.0.0'
)
ON CONFLICT (tool_id) DO UPDATE SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  schema = EXCLUDED.schema,
  api_spec = EXCLUDED.api_spec,
  visibility = EXCLUDED.visibility,
  owner_type = EXCLUDED.owner_type,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  icon = EXCLUDED.icon,
  version = EXCLUDED.version,
  updated_at = timezone('utc', now());

UPDATE oauth_provider
SET scopes = jsonb_set(
  jsonb_set(
    scopes,
    '{default}',
    (
      SELECT jsonb_agg(DISTINCT value)
      FROM jsonb_array_elements_text(
        COALESCE(scopes->'default', '[]'::jsonb) ||
        '[
          "https://www.googleapis.com/auth/spreadsheets.readonly",
          "https://www.googleapis.com/auth/spreadsheets"
        ]'::jsonb
      ) AS t(value)
    )
  ),
  '{sheets}',
  '[
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/spreadsheets"
  ]'::jsonb,
  true
)
WHERE provider_key = 'google_workspace';
