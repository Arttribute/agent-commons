# Staging / Production environment runbook

How to stand up the **staging** environment and cut over **production** to a
fresh database. Code + IaC for this are already in the repo; the steps below are
the operator actions (browser-based CLI logins expected).

**Model:** the current Supabase project (`fhidqytwidrxftjusmba`) becomes
**staging**. Production moves to a **fresh** Supabase project, born with RLS and
a non-superuser `commons_api` role. No data is copied to production.

Environments:

| | domain | branch | AWS stacks (suffix) | DB |
|---|---|---|---|---|
| production | www / api / auth.agentcommons.io | `main` | `-service`, `commons-platform-services` (unsuffixed) | fresh Supabase |
| staging | staging / api-staging / auth-staging.agentcommons.io | `staging` | `-service-staging`, `commons-platform-services-staging` | current Supabase |

---

## 1. Provision the fresh PRODUCTION database (Supabase)

```bash
supabase login
# Create a new project in the dashboard (region close to eu-west-1). Then:
#  - Enable extensions: uuid-ossp, vector (pgvector)
```

Apply schema to the fresh DB using the versioned runner:

```bash
# a) Generate the baseline from the CURRENT (soon-to-be-staging) DB, one time:
pg_dump "$CURRENT_DATABASE_URL" --schema-only --no-owner --no-privileges \
  --schema=public > apps/commons-api/migrations/versioned/000_baseline.sql

# b) Point env at the FRESH prod DB and run migrations (baseline + RLS + ...):
cd apps/commons-api
DATABASE_URL="$FRESH_PROD_DATABASE_URL" node scripts/migrate.mjs
# c) Give the app role a login + password (kept out of git):
psql "$FRESH_PROD_DATABASE_URL" -c \
  "ALTER ROLE commons_api WITH LOGIN PASSWORD '$(openssl rand -hex 24)';"
```

Also run the identity schema migrations against the fresh DB (schema
`commons_identity`) and seed OAuth clients:

```bash
pnpm --filter commons-identity migrate      # or the project's identity migrate cmd
pnpm --filter commons-identity oauth:bootstrap
```

Record the fresh prod DB creds — you will put them in the production secret in
step 3 (with `POSTGRES_USER=commons_api`).

---

## 2. Bootstrap the STAGING AWS stacks

```bash
aws sso login   # or: aws login

# Look up the shared source bucket name created by the prod bootstrap:
SRC_BUCKET=agent-commons-cicd-286273777416-eu-west-1

# API service bootstrap (staging): shared ECR/bucket/OIDC are NOT recreated.
aws cloudformation deploy \
  --stack-name agent-commons-api-bootstrap-staging \
  --template-file infra/aws/ecs-express-bootstrap.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides Environment=staging GitHubEnvironment=staging \
    SharedSourceBucketName="$SRC_BUCKET" \
  --region eu-west-1

# Platform (identity+gateway) bootstrap (staging):
aws cloudformation deploy \
  --stack-name commons-platform-bootstrap-staging \
  --template-file infra/aws/api-platform-bootstrap.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides Environment=staging \
    SourceBucketName="$SRC_BUCKET" \
    IdentityIssuerUrl="https://auth-staging.agentcommons.io/api/auth" \
    AgentCommonsInternalUrl="<staging api internal url, after first api deploy>" \
    CommonOsInternalUrl="<staging commonos internal url>" \
  --region eu-west-1
```

> The internal URLs are chicken-and-egg: deploy the staging **api** service
> first (step 4) to learn its ECS endpoint, then update the platform bootstrap
> stack with that value before deploying the gateway.

Re-apply the PRODUCTION bootstrap stacks too (they pick up the new CodeBuild env
vars / permissions; production physical names are unchanged):

```bash
aws cloudformation deploy --stack-name agent-commons-api-bootstrap \
  --template-file infra/aws/ecs-express-bootstrap.yml \
  --capabilities CAPABILITY_NAMED_IAM --parameter-overrides Environment=production \
  --region eu-west-1
aws cloudformation deploy --stack-name commons-platform-bootstrap \
  --template-file infra/aws/api-platform-bootstrap.yml \
  --capabilities CAPABILITY_NAMED_IAM --parameter-overrides Environment=production \
  --region eu-west-1
```

---

## 3. Populate secrets

Fill each environment's runtime secret. `import-runtime-secrets.sh` reads a
local env file and pushes every key in `runtime-secret-keys.txt`.

New keys this launch adds (must be set or the service will not start):
`CORS_ORIGIN`, `POSTGRES_SSL`, `SSRF_ALLOW_HOSTS`, `SPACE_RTC_TICKET_SECRET`,
`MANAGEMENT_KEY_ENABLED`.

```bash
# Staging (current Supabase DB, staging CommonOS fleet, TEST Stripe keys later):
infra/aws/import-runtime-secrets.sh apps/commons-api/.env.staging \
  agent-commons/commons-api/staging

# Production (FRESH DB creds, POSTGRES_USER=commons_api, live CommonOS fleet):
infra/aws/import-runtime-secrets.sh apps/commons-api/.env.production \
  agent-commons/commons-api/production
```

Recommended values:

- `CORS_ORIGIN` — prod: `https://www.agentcommons.io`; staging:
  `https://staging.agentcommons.io`.
- `POSTGRES_SSL` — `require` for a dedicated managed DB, `disable` via the
  Supabase pooler.
- `SSRF_ALLOW_HOSTS` — the CommonOS internal host(s) the API must still reach.
- `SPACE_RTC_TICKET_SECRET` — `openssl rand -hex 32` (distinct per env).
- `MANAGEMENT_KEY_ENABLED` — `true` during migration, flip to `false` once no
  management-key callers remain (watch the API logs for `management-key` warns).
- Staging `COMMON_OS_FLEET_ID` / `COMMON_OS_API_KEY` — a **separate staging
  fleet** on the same CommonOS deployment.

Set the identity + gateway secrets similarly (`agent-commons/identity/<env>`,
`agent-commons/api-gateway/<env>`), including `COMMONS_TRUSTED_ORIGINS` and, for
staging, `RETURN_TO_*` / `DASHBOARD_URL_*` overrides pointing at staging domains.

---

## 4. GitHub environments + first deploy

- Create a GitHub environment **staging** with vars: `AWS_DEPLOY_ROLE_ARN`
  (staging bootstrap output `GitHubDeployRoleArn`), `AWS_REGION`,
  `AWS_SOURCE_BUCKET`, `AWS_CODEBUILD_PROJECT=agent-commons-api-staging`,
  `AWS_PLATFORM_CODEBUILD_PROJECT=commons-platform-staging`.
- Add required reviewers to the **production** environment.
- Create the `staging` branch and push; both deploy workflows fire against the
  staging CodeBuild projects.

```bash
git checkout -b staging && git push -u origin staging
```

---

## 5. DNS + Vercel

- DNS (Route53/registrar):
  - `staging.agentcommons.io` → Vercel (staging project)
  - `api-staging.agentcommons.io` → staging gateway ECS endpoint (CNAME)
  - `auth-staging.agentcommons.io` → staging identity (CloudFront or direct)
- Vercel: create project `agent-commons-staging` (same repo, production branch =
  `staging`, domain `staging.agentcommons.io`). Per-env vars:
  `NEXT_PUBLIC_NEST_API_BASE_URL=https://api-staging.agentcommons.io`, staging
  identity issuer/client, rotated secrets. Update the existing prod Vercel
  project for the fresh-DB world (and remove `NEXT_PUBLIC_SUPABASE_*` once the
  browser client is gone — Phase 3).

---

## 6. Cut production over to the fresh DB

1. Put the fresh prod DB creds (with `POSTGRES_USER=commons_api`,
   `POSTGRES_PASSWORD=<step 1c>`, `POSTGRES_SSL` as appropriate) into
   `agent-commons/commons-api/production` and `DATABASE_URL` for identity.
2. `workflow_dispatch` the two prod deploy workflows (or push to `main`).
3. Smoke test www/api/auth.agentcommons.io: sign up as the first user, create an
   agent, run a chat.

Rollback for the RLS role: revert `POSTGRES_USER/PASSWORD` in the secret to the
previous superuser role and redeploy.

---

## Verify

- Staging E2E: sign up at `staging.agentcommons.io` → create agent → chat →
  start a computer (staging fleet) → `AGC_API_URL=https://api-staging.agentcommons.io agc login`.
- Confirm isolation: staging writes only in the old Supabase project, prod
  writes only in the fresh one.
- Confirm anon key is dead against prod PostgREST (`permission denied`).
