# Commons Identity

Standalone Hono + Better Auth identity authority for every Commons product.

## Local setup

```bash
docker compose -f apps/commons-identity/docker-compose.yml up -d
cp apps/commons-identity/.env.example apps/commons-identity/.env
pnpm --filter commons-identity db:migrate
pnpm --filter commons-identity oauth:bootstrap
pnpm --filter commons-identity dev
```

The OAuth bootstrap command prints each client ID and secret once. Store
production secrets in AWS Secrets Manager.

## Stable production endpoints

- Issuer: `https://auth.agentcommons.io/api/auth`
- Discovery: `https://auth.agentcommons.io/api/auth/.well-known/openid-configuration`
- JWKS: `https://auth.agentcommons.io/api/auth/.well-known/jwks.json`
- Google callback: `https://auth.agentcommons.io/api/auth/callback/google`
- Device verification: `https://auth.agentcommons.io/device`

## Google OAuth clients

Use separate Google web clients for local and production environments.

Production:

- Authorized origin: `https://auth.agentcommons.io`
- Authorized redirect URI:
  `https://auth.agentcommons.io/api/auth/callback/google`

Local:

- Authorized origin: `http://localhost:3010`
- Authorized redirect URI:
  `http://localhost:3010/api/auth/callback/google`

Google never needs callbacks for Courses, Agent Commons, or Common OS. Those
applications are OIDC clients of Commons Identity.

## Migration safety

Identity migration is dry-run by default:

```bash
pnpm --filter commons-identity identity:migrate
```

Applying requires both the explicit command and confirmation variable:

```bash
IDENTITY_MIGRATION_CONFIRM=APPLY_COMMONS_IDENTITY_MIGRATION \
pnpm --filter commons-identity identity:migrate:apply
```

The migration always reserves `bashybaranaba@gmail.com` as a canonical account
group and links matching verified email, Privy, wallet, Agent Commons, Courses,
and Common OS aliases.
