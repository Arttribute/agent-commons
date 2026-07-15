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
- `X_OAUTH_CLIENT_ID` / `X_OAUTH_CLIENT_SECRET` — the confidential X developer
  app used for one-click account connections. Register
  `https://<web-domain>/api/oauth/callback/x` and enable OAuth 2.0 with PKCE.
  After both fields exist in the runtime secret, set the API CodeBuild
  environment variable `X_OAUTH_ENABLED=true`; it remains `false` by default so
  environments without an X app still deploy safely.
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

## 7. Enable Stripe billing (per environment)

Billing code degrades gracefully when Stripe is unconfigured, so merging it does
not require secrets. Turn it on deliberately:

1. `stripe login`. In **test** mode (staging) create products + recurring prices
   for Plus/Pro/Max and one-time prices for the three top-up packs; create a
   test coupon + promotion code. Repeat in **live** mode for production.
2. Add these keys to the environment's runtime secret
   (`agent-commons/commons-api/<env>`) **and** the matching `Secrets` entries to
   `infra/aws/ecs-express-service.yml` (they are intentionally not there yet so
   deploys don't fail before Stripe exists):
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`,
   `STRIPE_PRICE_PRO`, `STRIPE_PRICE_MAX`, `STRIPE_PRICE_TOPUP_SMALL`,
   `STRIPE_PRICE_TOPUP_MEDIUM`, `STRIPE_PRICE_TOPUP_LARGE`,
   `CREDIT_UNITS_PER_USD`, `CREDIT_DEBITS_ENABLED`.
3. In the Stripe dashboard add a webhook endpoint →
   `https://api-<env>.agentcommons.io/v1/billing/webhook`; copy its signing
   secret into `STRIPE_WEBHOOK_SECRET`. Subscribe to: `checkout.session.completed`,
   `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`.
4. Local dev: `stripe listen --forward-to localhost:3001/v1/billing/webhook`.
5. Run `node apps/commons-api/scripts/analyze-usage-margins.mjs` against the
   current usage data to sanity-check the tier grants before finalizing prices.
6. Flip `CREDIT_DEBITS_ENABLED=true` when you want token usage to actually burn
   credits (start on staging).

Verify (staging, test card `4242 4242 4242 4242`): subscribe to Plus →
`subscription` row active + a 5,000-credit `subscription_grant` in the ledger;
`stripe trigger invoice.paid` twice → single grant (idempotent); top-up with the
promo code → discounted, credits granted once; portal cancel → reverts at period
end.

## 8. Production launch cutover checklist

Run after everything has been exercised on staging.

1. **Migrations**: `RUN_MIGRATIONS=true` on the prod API deploy once so
   001_rls → 004_feature_flags are applied to the fresh prod DB; confirm
   `pnpm --filter commons-api migrate:status` shows all applied.
2. **RLS role**: prod `POSTGRES_USER=commons_api` (+ password from step 1c);
   verify the anon key gets `permission denied` on every table via PostgREST.
3. **Rotate `API_SECRET_KEY`** (deferred from Phase 0): generate a new value,
   update `agent-commons/commons-api/production` + Vercel `NEST_API_SECRET_KEY`,
   redeploy the prod API + commons-app. Then set `MANAGEMENT_KEY_ENABLED=false`
   once the API logs show no `management-key` warnings for ~2 weeks.
4. **Stripe live**: complete section 7 in live mode; real $10 top-up + refund
   smoke test; confirm the live webhook signing secret verifies.
5. **Flip enforcement toggles on prod** (each independent):
   `CREDIT_DEBITS_ENABLED=true`, `BILLING_ENFORCEMENT=true`,
   `COMPUTE_METERING_ENABLED=true`, `BILLING_SWEEPER_ENABLED=true`.
6. **Alarms**: CloudWatch on `/v1/billing/webhook` 5xx, CodeBuild failures, and
   ECS CPU/health; page on webhook failures (Stripe will retry, but investigate).
7. **Grandfather early users**: one-time comp grant via `POST /v1/credits/grants`
   (service token with `credits:write`).
8. **Runbook drills**: webhook replay (resend from the Stripe dashboard; the
   `stripe_webhook_event` row makes it idempotent); RLS rollback (swap
   `POSTGRES_USER` back); metering kill switch (`COMPUTE_METERING_ENABLED=false`).
9. Confirm the GitHub **production** environment requires reviewers and the
   `staging` branch protection is in place.

## Verify

- Staging E2E: sign up at `staging.agentcommons.io` → create agent → chat →
  start a computer (staging fleet) → `AGC_API_URL=https://api-staging.agentcommons.io agc login`.
- Confirm isolation: staging writes only in the old Supabase project, prod
  writes only in the fresh one.
- Confirm anon key is dead against prod PostgREST (`permission denied`).
