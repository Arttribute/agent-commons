# OAuth connectors

Agent Commons uses one platform OAuth app per provider and environment. Users
authorize that app in the browser; `commons-api` encrypts access, refresh, and
OIDC tokens with `TOOL_KEY_ENCRYPTION_MASTER`. Tool calls resolve the initiating
user's connection, refresh expiring tokens when possible, and inject the access
token only into the provider request.

## Supported providers

| Provider         | Runtime credentials                                    | Callback path                          | Notes                                                                                                         |
| ---------------- | ------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Google Workspace | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | `/api/oauth/callback/google_workspace` | Request offline access. Sensitive Gmail and Workspace scopes may require Google verification.                 |
| GitHub           | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | `/api/oauth/callback/github`           | Uses a GitHub OAuth App. Its normal access token has no refresh token and is tested directly against `/user`. Native tools cover profiles, repositories, issues, and pull requests. |
| Slack            | `SLACK_OAUTH_CLIENT_ID`, `SLACK_OAUTH_CLIENT_SECRET`   | `/api/oauth/callback/slack`            | Configure bot scopes and the redirect URL in the Slack app. Token rotation is supported.                      |
| Canva            | `CANVA_OAUTH_CLIENT_ID`, `CANVA_OAUTH_CLIENT_SECRET`   | `/api/oauth/callback/canva`            | Enable Authorization Code with PKCE.                                                                          |
| X                | `X_OAUTH_CLIENT_ID`, `X_OAUTH_CLIENT_SECRET`           | `/api/oauth/callback/x`                | Enable OAuth 2.0 Authorization Code with PKCE and offline access.                                             |

Use separate provider apps for staging and production. Register the exact HTTPS
callback on each app:

```text
https://staging.agentcommons.io/api/oauth/callback/github
https://www.agentcommons.io/api/oauth/callback/github
```

Replace `github` with the callback path in the table for other providers.
Localhost may use HTTP:

```text
http://localhost:3000/api/oauth/callback/github
```

## Local setup

1. Set `TOOL_KEY_ENCRYPTION_MASTER` to a stable 32-byte key. Changing it makes
   existing encrypted provider secrets and user tokens unreadable.
2. Set both credential variables for every provider being enabled. A
   half-configured provider is ignored.
3. Set `APP_ORIGIN` to the web origin.
4. Apply `pnpm --filter commons-api migrate`.
5. Start the API. Startup creates or updates provider records and encrypts
   their client secrets.

## AWS setup

Add the provider credentials to the environment's runtime secret, then set the
matching CodeBuild flag:

```text
GOOGLE_OAUTH_ENABLED=true
GITHUB_OAUTH_ENABLED=true
SLACK_OAUTH_ENABLED=true
CANVA_OAUTH_ENABLED=true
X_OAUTH_ENABLED=true
```

Flags default to `false` so environments without an optional provider key still
deploy. `APP_ORIGIN` defaults to the production or staging web domain and can
be overridden in CodeBuild.

## End-to-end smoke test

For each provider:

1. Open Studio → Tools and select the provider.
2. Review scopes, connect, approve consent, and verify the browser returns to
   Studio with the provider marked Connected.
3. Run `agc connections list`, then `agc connections test <connection-id>`, or
   execute a provider-backed tool.
4. For GitHub, list repositories with an agent, then verify that issue and pull
   request creation pauses for explicit confirmation. Export a code project and
   verify the repository and files were created. The requested `repo` scope is
   needed for the default private export.
5. Disconnect the account in the tool permission panel. Confirm the provider
   grant is revoked remotely when supported and the local encrypted tokens are
   deleted.

Also test a denied consent, an expired state (wait more than ten minutes), and a
reconnect that adds scopes. Previously granted scopes remain until the account
is disconnected because most providers do not support reducing an existing
grant through incremental authorization.
