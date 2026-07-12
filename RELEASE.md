# Release & versioning

How the `@agent-commons/sdk` and `@agent-commons/cli` packages are versioned and
published, and how that maps to the deploy environments.

## Branch model

| Branch | Deploys to | npm dist-tag |
|--------|-----------|--------------|
| `staging` | staging infra (api-staging, staging.agentcommons.io) | `staging` (canary) |
| `main` | production (api.agentcommons.io, www) | `latest` (stable) |

Work flows **feature branch → PR → `staging` → PR → `main`**. Nothing lands on
`main` without going through `staging` first.

## Adding a changeset (every meaningful package change)

When you change `packages/commons-sdk` or `packages/agc-cli`, add a changeset in
the same PR:

```bash
pnpm changeset
# pick the packages + bump type (patch/minor/major), write a summary
```

Commit the generated `.changeset/*.md`. CI does not require it, but the release
flow uses it to compute versions and changelogs.

## Staging: canary releases (`staging` tag)

Every push to `staging` runs `.github/workflows/release-staging.yml`, which does
a **changeset snapshot** publish:

```
@agent-commons/sdk@1.4.0-staging-20260712120000  (dist-tag: staging)
@agent-commons/cli@1.4.0-staging-20260712120000  (dist-tag: staging)
```

Install a canary to test against staging:

```bash
pnpm add @agent-commons/sdk@staging
npm i -g @agent-commons/cli@staging
```

Snapshots do **not** consume changeset files or bump committed versions — the
version history stays driven solely by the `main` flow below.

## Production: stable releases (`latest` tag)

`.github/workflows/release.yml` runs on `main` via the Changesets action:

1. When changesets are present on `main`, it opens/updates a **"Version
   Packages"** PR that applies the bumps and updates `CHANGELOG.md`.
2. Merging that PR publishes the new stable versions to the `latest` tag
   (`pnpm release` → `changeset publish`) and then bumps
   `apps/commons-app`'s `@agent-commons/sdk` dependency to the published version.

Production consumers (and `apps/commons-app` in production) always resolve
`@agent-commons/sdk@latest` — never a staging canary.

## Required repo secrets

- `NPM_TOKEN` — npm automation token with publish rights to the
  `@agent-commons` scope (used by both release workflows).
- `GH_PAT` — token the Changesets action uses to open the Version Packages PR
  and push the post-publish dependency bump on `main`.

## Manual release (break-glass)

`scripts/release-manual.sh [patch|minor|major]` performs a local version + npm
publish to `latest`. Use only when the CI flow is unavailable.
