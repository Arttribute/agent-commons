-- Native GitHub tools backed by the user's OAuth connection. Read actions run
-- directly; actions that create public/shared content require explicit review.

INSERT INTO tool (
  tool_id, name, display_name, description, schema, api_spec, visibility,
  owner_type, category, tags, icon, version
) VALUES
(
  '33333333-3333-4333-8333-333333333301',
  'github_get_profile',
  'GitHub: get connected profile',
  'Returns the GitHub identity associated with the active OAuth connection.',
  '{
    "type": "function",
    "function": {
      "name": "github_get_profile",
      "description": "Get the profile for the connected GitHub account before performing account-specific actions.",
      "parameters": { "type": "object", "properties": {} }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.github.com",
    "path": "/user",
    "method": "GET",
    "headers": {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    "authType": "oauth2",
    "oauthProviderKey": "github",
    "oauthScopes": ["read:user"]
  }'::jsonb,
  'platform', 'platform', 'developer_tools',
  '["github", "repositories", "oauth2", "identity", "read"]'::jsonb,
  'github', '1.0.0'
),
(
  '33333333-3333-4333-8333-333333333302',
  'github_list_repositories',
  'GitHub: list repositories',
  'Lists repositories the connected user can access.',
  '{
    "type": "function",
    "function": {
      "name": "github_list_repositories",
      "description": "List repositories the connected GitHub user can access.",
      "parameters": {
        "type": "object",
        "properties": {
          "visibility": {
            "type": "string",
            "enum": ["all", "public", "private"],
            "description": "Optional visibility filter."
          },
          "affiliation": {
            "type": "string",
            "description": "Optional comma-separated affiliations, such as owner,collaborator,organization_member."
          },
          "sort": {
            "type": "string",
            "enum": ["created", "updated", "pushed", "full_name"],
            "description": "Optional sort field."
          },
          "perPage": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "description": "Maximum repositories to return."
          }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.github.com",
    "path": "/user/repos",
    "method": "GET",
    "headers": {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    "queryParams": {
      "visibility": "{visibility}",
      "affiliation": "{affiliation}",
      "sort": "{sort}",
      "per_page": "{perPage}"
    },
    "authType": "oauth2",
    "oauthProviderKey": "github",
    "oauthScopes": ["repo"]
  }'::jsonb,
  'platform', 'platform', 'developer_tools',
  '["github", "repositories", "oauth2", "list", "read"]'::jsonb,
  'github', '1.0.0'
),
(
  '33333333-3333-4333-8333-333333333303',
  'github_get_repository',
  'GitHub: get repository',
  'Returns metadata and permissions for a repository visible to the connected user.',
  '{
    "type": "function",
    "function": {
      "name": "github_get_repository",
      "description": "Get repository metadata, default branch, visibility, and the connected user''s permissions.",
      "parameters": {
        "type": "object",
        "required": ["owner", "repo"],
        "properties": {
          "owner": { "type": "string", "description": "Repository owner login or organization." },
          "repo": { "type": "string", "description": "Repository name without .git." }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.github.com",
    "path": "/repos/{owner}/{repo}",
    "method": "GET",
    "headers": {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    "authType": "oauth2",
    "oauthProviderKey": "github",
    "oauthScopes": ["repo"]
  }'::jsonb,
  'platform', 'platform', 'developer_tools',
  '["github", "repositories", "oauth2", "metadata", "read"]'::jsonb,
  'github', '1.0.0'
),
(
  '33333333-3333-4333-8333-333333333304',
  'github_search_issues_and_pull_requests',
  'GitHub: search issues and pull requests',
  'Searches issues and pull requests visible to the connected user.',
  '{
    "type": "function",
    "function": {
      "name": "github_search_issues_and_pull_requests",
      "description": "Search GitHub issues and pull requests with GitHub search qualifiers.",
      "parameters": {
        "type": "object",
        "required": ["query"],
        "properties": {
          "query": {
            "type": "string",
            "description": "GitHub issue search query, for example repo:owner/repo is:open label:bug."
          },
          "sort": {
            "type": "string",
            "enum": ["comments", "reactions", "reactions-+1", "reactions--1", "reactions-smile", "reactions-thinking_face", "reactions-heart", "reactions-tada", "interactions", "created", "updated"],
            "description": "Optional sort field."
          },
          "order": {
            "type": "string",
            "enum": ["asc", "desc"],
            "description": "Optional sort order."
          },
          "perPage": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "description": "Maximum results to return."
          }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.github.com",
    "path": "/search/issues",
    "method": "GET",
    "headers": {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    "queryParams": {
      "q": "{query}",
      "sort": "{sort}",
      "order": "{order}",
      "per_page": "{perPage}"
    },
    "authType": "oauth2",
    "oauthProviderKey": "github",
    "oauthScopes": ["repo"]
  }'::jsonb,
  'platform', 'platform', 'developer_tools',
  '["github", "issues", "pull-requests", "oauth2", "search", "read"]'::jsonb,
  'github', '1.0.0'
),
(
  '33333333-3333-4333-8333-333333333305',
  'github_create_issue',
  'GitHub: create issue',
  'Creates a GitHub issue after the user explicitly approves its repository, title, and body.',
  '{
    "type": "function",
    "function": {
      "name": "github_create_issue",
      "description": "Create an issue. Show the target repository, title, and body to the user first, then set confirmed=true only after explicit approval.",
      "parameters": {
        "type": "object",
        "required": ["owner", "repo", "title", "confirmed"],
        "properties": {
          "owner": { "type": "string", "description": "Repository owner login or organization." },
          "repo": { "type": "string", "description": "Repository name without .git." },
          "title": { "type": "string", "description": "Exact issue title approved by the user." },
          "body": { "type": "string", "description": "Exact issue body approved by the user." },
          "labels": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Optional label names."
          },
          "confirmed": {
            "type": "boolean",
            "description": "Must be true only after the user explicitly approves this exact issue."
          }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.github.com",
    "path": "/repos/{owner}/{repo}/issues",
    "method": "POST",
    "headers": {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    "bodyTemplate": {
      "title": "{title}",
      "body": "{body}",
      "labels": "{labels}"
    },
    "requiresConfirmation": true,
    "authType": "oauth2",
    "oauthProviderKey": "github",
    "oauthScopes": ["repo"]
  }'::jsonb,
  'platform', 'platform', 'developer_tools',
  '["github", "issues", "oauth2", "write", "public-action"]'::jsonb,
  'github', '1.0.0'
),
(
  '33333333-3333-4333-8333-333333333306',
  'github_create_pull_request',
  'GitHub: create pull request',
  'Creates a GitHub pull request after the user explicitly approves its repository, branches, title, and body.',
  '{
    "type": "function",
    "function": {
      "name": "github_create_pull_request",
      "description": "Create a pull request. Show the target repository, branches, title, and body to the user first, then set confirmed=true only after explicit approval.",
      "parameters": {
        "type": "object",
        "required": ["owner", "repo", "title", "head", "base", "confirmed"],
        "properties": {
          "owner": { "type": "string", "description": "Repository owner login or organization." },
          "repo": { "type": "string", "description": "Repository name without .git." },
          "title": { "type": "string", "description": "Exact pull request title approved by the user." },
          "head": { "type": "string", "description": "Branch containing the proposed changes." },
          "base": { "type": "string", "description": "Branch the changes should be merged into." },
          "body": { "type": "string", "description": "Exact pull request body approved by the user." },
          "draft": { "type": "boolean", "description": "Whether to create the pull request as a draft." },
          "confirmed": {
            "type": "boolean",
            "description": "Must be true only after the user explicitly approves this exact pull request."
          }
        }
      }
    }
  }'::jsonb,
  '{
    "baseUrl": "https://api.github.com",
    "path": "/repos/{owner}/{repo}/pulls",
    "method": "POST",
    "headers": {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    "bodyTemplate": {
      "title": "{title}",
      "head": "{head}",
      "base": "{base}",
      "body": "{body}",
      "draft": "{draft}"
    },
    "requiresConfirmation": true,
    "authType": "oauth2",
    "oauthProviderKey": "github",
    "oauthScopes": ["repo"]
  }'::jsonb,
  'platform', 'platform', 'developer_tools',
  '["github", "pull-requests", "oauth2", "write", "public-action"]'::jsonb,
  'github', '1.0.0'
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
