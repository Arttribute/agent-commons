# Commons Identity rollout

## Canonical model

- Human principal: `usr_*`
- Workspace: `wsp_*`
- Agent: Agent Commons `agent_id`
- Common OS agent record: deployment of an Agent Commons agent
- Legacy identifiers remain aliases during migration.

Product databases stay separate. Records are joined by canonical IDs and
signed activity events.

The unified developer API is `https://api.agentcommons.io/v1`. See
`docs/api-platform.md` for routing, project credentials, and service
boundaries.

## OAuth clients and redirect URIs

Create separate Commons Identity OAuth clients per application and environment.
Never use wildcard redirects.

| Client | Local redirect | Production redirect |
|---|---|---|
| Agent Commons | `http://localhost:3000/api/auth/callback/commons` | `https://www.agentcommons.io/api/auth/callback/commons` |
| Courses | `http://localhost:3002/api/auth/callback/commons` | `https://commonlab.agentcommons.io/api/auth/callback/commons` |
| Common OS | `http://localhost:3003/api/auth/callback/commons` | Set the exact deployed Common OS callback |

All web clients use Authorization Code + PKCE. CLI uses RFC 8628 device
authorization and exchanges its session credential for a short-lived ES256
Commons JWT. Services use Client Credentials.

## Consumer configuration

Every API:

```dotenv
COMMONS_IDENTITY_ISSUER=https://auth.agentcommons.io/api/auth
COMMONS_IDENTITY_JWKS_URL=https://auth.agentcommons.io/api/auth/.well-known/jwks.json
COMMONS_IDENTITY_AUDIENCE=commons-platform
```

Every web application:

```dotenv
COMMONS_IDENTITY_ISSUER=https://auth.agentcommons.io/api/auth
COMMONS_IDENTITY_CLIENT_ID=<application client id>
COMMONS_IDENTITY_CLIENT_SECRET=<application client secret>
AUTH_SECRET=<application session secret>
COMMONS_AUTH_SESSION_VERSION=v2
```

Courses verification and Common OS provisioning use client-credentials IDs and
secrets created by `commons-identity oauth:bootstrap`.

## Forced re-authentication

Use `COMMONS_AUTH_SESSION_VERSION` as the controlled re-authentication switch
for auth migrations or security events. Increasing this value changes the
browser session cookie names used by Commons Identity, Agent Commons and
CommonLab, so existing browser sessions are no longer recognized and users must
sign in again through the current Commons Identity flow.

This does not delete users, workspaces, enrollments, agents, OAuth clients or
identity records. Keep the same value across Identity and all web applications
in an environment. To repeat the process later, bump the version again, deploy
the affected services together, and verify that a previously signed-in browser
is redirected to sign in.

## Production order

1. Provision RDS PostgreSQL, Secrets Manager values, ECS service, ALB, ACM,
   Route 53, WAF, CloudWatch and backups.
2. Run the identity database migration as a one-off ECS task.
3. Bootstrap OAuth clients once and store returned secrets.
4. Configure the production Google OAuth client.
5. Deploy Commons Identity and verify discovery, JWKS, email and Google login.
6. Run the legacy identity migration in dry-run mode and review collisions.
7. Deploy consumer applications with legacy compatibility enabled.
8. Apply the identity migration.
9. Confirm Courses, Agent Commons, Common OS and CLI flows.
10. Disable `ALLOW_LEGACY_MANAGEMENT_AUTH`, then rotate old management keys.

## Required acceptance checks

- A Courses learner signs in and opens Agent Commons without registering again.
- The same `usr_*` owns their enrollments, agents and Common OS tenant.
- Creating an agent emits `agent.created`.
- Deploying an existing agent to Common OS does not create a second Agent
  Commons identity.
- A course practical task verifies from a signed activity event.
- CLI device login works without copying API keys.
- Revoked API keys and expired JWTs are rejected.
- Privy is invoked only when wallet functionality is requested.
