-- Adds Google Workspace write/send tools that were missing from the first
-- seed batch (add-google-workspace-tools.sql):
--   * google_gmail_send_message — sends email via Gmail (uses the
--     "gmailRawMessage" bodyTransform implemented in AgentToolsController,
--     which builds the base64url RFC822 payload Gmail requires)
--   * google_calendar_list_calendars — lists the calendars the user can see
--
-- Like the rest of the Google tools these are OAuth-backed and therefore only
-- available to agents that have an explicit, enabled agent_tool assignment.

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
  '11111111-1111-4111-8111-111111111117',
  'google_gmail_send_message',
  'Gmail: send message',
  'Sends an email from the authorized Gmail account. Use only when the user has explicitly asked to send an email and has confirmed the recipient, subject, and body.',
  '{
    "type": "function",
    "function": {
      "name": "google_gmail_send_message",
      "description": "Send an email from the user''s Gmail account. Confirm recipient, subject, and body with the user before sending.",
      "parameters": {
        "type": "object",
        "required": ["to", "subject", "body"],
        "properties": {
          "to": { "type": "string", "description": "Recipient email address (comma-separate multiple)." },
          "subject": { "type": "string", "description": "Email subject." },
          "body": { "type": "string", "description": "Plain-text email body." },
          "cc": { "type": "string", "description": "Optional CC recipients, comma-separated." },
          "bcc": { "type": "string", "description": "Optional BCC recipients, comma-separated." }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://gmail.googleapis.com",
    "path": "/gmail/v1/users/me/messages/send",
    "method": "POST",
    "bodyTransform": "gmailRawMessage",
    "authType": "oauth2",
    "oauthProviderKey": "google_workspace"
  }'::jsonb,
  'platform',
  'platform',
  'email',
  '["google", "gmail", "oauth2", "platform", "write"]'::jsonb,
  'gmail',
  '1.0.0'
),
(
  '11111111-1111-4111-8111-111111111118',
  'google_calendar_list_calendars',
  'Google Calendar: list calendars',
  'Lists the calendars on the authorized user''s calendar list.',
  '{
    "type": "function",
    "function": {
      "name": "google_calendar_list_calendars",
      "description": "List the calendars the user has access to.",
      "parameters": {
        "type": "object",
        "properties": {
          "maxResults": { "type": "integer", "description": "Maximum number of calendars to return.", "default": 50 }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://www.googleapis.com",
    "path": "/calendar/v3/users/me/calendarList",
    "method": "GET",
    "queryParams": { "maxResults": "{maxResults}" },
    "authType": "oauth2",
    "oauthProviderKey": "google_workspace"
  }'::jsonb,
  'platform',
  'platform',
  'calendar',
  '["google", "calendar", "oauth2", "platform"]'::jsonb,
  'google-calendar',
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

-- Make sure the Gmail scope group (and defaults) cover sending mail.
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
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send"
        ]'::jsonb
      ) AS t(value)
    )
  ),
  '{gmail}',
  '[
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send"
  ]'::jsonb,
  true
)
WHERE provider_key = 'google_workspace';
