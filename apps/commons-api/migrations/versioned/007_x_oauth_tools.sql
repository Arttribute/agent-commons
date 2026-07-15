-- Native X (Twitter) tools shared by Agent Commons, OpenClaw, and Hermes.
-- The OAuth provider itself is synchronized from X_OAUTH_CLIENT_ID and
-- X_OAUTH_CLIENT_SECRET at API startup so its client secret is encrypted with
-- the environment's existing encryption key.

INSERT INTO tool (
  tool_id, name, display_name, description, schema, api_spec, visibility,
  owner_type, category, tags, icon, version
) VALUES
(
  '22222222-2222-4222-8222-222222222201',
  'x_get_profile',
  'X: get connected profile',
  'Returns the identity of the connected X account. Use this to verify which account the agent will act as.',
  '{
    "type": "function",
    "function": {
      "name": "x_get_profile",
      "description": "Get the profile for the connected X account before performing account-specific actions.",
      "parameters": { "type": "object", "properties": {} }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.x.com",
    "path": "/2/users/me",
    "method": "GET",
    "queryParams": { "user.fields": "id,name,username,profile_image_url,verified" },
    "authType": "oauth2",
    "oauthProviderKey": "x",
    "oauthScopes": ["tweet.read", "users.read"]
  }'::jsonb,
  'platform', 'platform', 'social',
  '["x", "twitter", "social", "oauth2", "read"]'::jsonb,
  'twitter', '1.0.0'
),
(
  '22222222-2222-4222-8222-222222222202',
  'x_get_post',
  'X: read post',
  'Reads a post and its public author and engagement fields by post ID.',
  '{
    "type": "function",
    "function": {
      "name": "x_get_post",
      "description": "Read one X post by ID.",
      "parameters": {
        "type": "object",
        "required": ["postId"],
        "properties": {
          "postId": { "type": "string", "description": "The numeric X post ID." }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.x.com",
    "path": "/2/tweets/{postId}",
    "method": "GET",
    "queryParams": {
      "tweet.fields": "id,text,author_id,created_at,conversation_id,public_metrics,referenced_tweets",
      "expansions": "author_id",
      "user.fields": "id,name,username,verified"
    },
    "authType": "oauth2",
    "oauthProviderKey": "x",
    "oauthScopes": ["tweet.read", "users.read"]
  }'::jsonb,
  'platform', 'platform', 'social',
  '["x", "twitter", "social", "oauth2", "read"]'::jsonb,
  'twitter', '1.0.0'
),
(
  '22222222-2222-4222-8222-222222222203',
  'x_search_recent_posts',
  'X: search recent posts',
  'Searches recent X posts available to the connected account and X API plan.',
  '{
    "type": "function",
    "function": {
      "name": "x_search_recent_posts",
      "description": "Search recent X posts. This is read-only and may depend on the connected app''s X API access tier.",
      "parameters": {
        "type": "object",
        "required": ["query"],
        "properties": {
          "query": { "type": "string", "description": "An X search query." },
          "maxResults": { "type": "integer", "minimum": 10, "maximum": 100, "description": "Number of results, from 10 to 100." }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.x.com",
    "path": "/2/tweets/search/recent",
    "method": "GET",
    "queryParams": {
      "query": "{query}",
      "max_results": "{maxResults}",
      "tweet.fields": "id,text,author_id,created_at,public_metrics",
      "expansions": "author_id",
      "user.fields": "id,name,username,verified"
    },
    "authType": "oauth2",
    "oauthProviderKey": "x",
    "oauthScopes": ["tweet.read", "users.read"]
  }'::jsonb,
  'platform', 'platform', 'social',
  '["x", "twitter", "social", "oauth2", "search", "read"]'::jsonb,
  'twitter', '1.0.0'
),
(
  '22222222-2222-4222-8222-222222222204',
  'x_create_post',
  'X: publish post',
  'Publishes a post, reply, or quote from the connected X account. The exact content must be shown to the user and explicitly confirmed before execution.',
  '{
    "type": "function",
    "function": {
      "name": "x_create_post",
      "description": "Publish a post, reply, or quote on X. Before calling, show the exact text and target to the user and obtain explicit confirmation. Set confirmed=true only after that approval.",
      "parameters": {
        "type": "object",
        "required": ["text", "confirmed"],
        "properties": {
          "text": { "type": "string", "description": "Exact post text approved by the user." },
          "replyToPostId": { "type": "string", "description": "Optional post ID to reply to." },
          "quotePostId": { "type": "string", "description": "Optional post ID to quote. Do not combine with replyToPostId." },
          "confirmed": { "type": "boolean", "description": "Must be true only after the user has explicitly approved this exact public post." }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.x.com",
    "path": "/2/tweets",
    "method": "POST",
    "headers": { "Content-Type": "application/json" },
    "bodyTransform": "xCreatePost",
    "requiresConfirmation": true,
    "authType": "oauth2",
    "oauthProviderKey": "x",
    "oauthScopes": ["tweet.read", "tweet.write", "users.read"]
  }'::jsonb,
  'platform', 'platform', 'social',
  '["x", "twitter", "social", "oauth2", "write", "public-action"]'::jsonb,
  'twitter', '1.0.0'
),
(
  '22222222-2222-4222-8222-222222222205',
  'x_delete_post',
  'X: delete post',
  'Deletes a post authored by the connected X account after explicit user confirmation.',
  '{
    "type": "function",
    "function": {
      "name": "x_delete_post",
      "description": "Delete an X post owned by the connected account. Show the post ID/content to the user first and set confirmed=true only after explicit approval.",
      "parameters": {
        "type": "object",
        "required": ["postId", "confirmed"],
        "properties": {
          "postId": { "type": "string", "description": "The numeric ID of the post to delete." },
          "confirmed": { "type": "boolean", "description": "Must be true only after the user explicitly approves deleting this post." }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.x.com",
    "path": "/2/tweets/{postId}",
    "method": "DELETE",
    "requiresConfirmation": true,
    "authType": "oauth2",
    "oauthProviderKey": "x",
    "oauthScopes": ["tweet.read", "tweet.write", "users.read"]
  }'::jsonb,
  'platform', 'platform', 'social',
  '["x", "twitter", "social", "oauth2", "write", "delete", "public-action"]'::jsonb,
  'twitter', '1.0.0'
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
