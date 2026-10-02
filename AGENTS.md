# Working in this repository

Instructions for coding agents (Claude Code, Codex and others) and the people who run them. `CLAUDE.md` describes the codebase. This file describes how changes reach production.

## Every change goes through staging

`main` is production. Pushes to `main` deploy www.agentcommons.io (Vercel), the API (AWS), and the identity service and API gateway (AWS). `staging` deploys staging.agentcommons.io and the staging API.

Follow this route for every change, including small fixes and hotfixes:

1. Branch from `staging`: `git switch -c <type>/<short-name> origin/staging`.
2. Open the pull request against `staging`, never against `main`.
3. Wait for CI. The PR needs `Build and Test` and, when it touches the desktop app, the `Desktop` workflow (it installs and launches the app on Windows, macOS and Linux).
4. Merge into `staging`, then verify the change on staging.agentcommons.io or the staging API.
5. Promote with one pull request from `staging` into `main`, titled `Release YYYY-MM-DD` and listing the PRs it contains. Merge it with a merge commit, not a squash, so the two branches keep the same history.

After a promotion, the `Sync staging` workflow fast-forwards `staging` to `main`, so new branches start from what production runs.

`main` is protected. The `Main only accepts staging` check fails any pull request into `main` whose source branch is not `staging`. Never push to `main` directly. Repository admins can override protection in an emergency. Even then, merge the same fix into `staging` straight away.

## What staging cannot verify

- **Identity and gateway** (`apps/commons-identity`, `apps/commons-api-gateway`) have no staging deployment yet. Staging uses production identity. Say in the PR that the change can only be verified in production, and check it right after the promotion deploys.
- **Production sits behind the API gateway; staging does not.** A route can work on staging and return 401 in production. New public API routes need an entry in the gateway's public allowlist.
- **Desktop releases** are built from `main` (see below), so staging only proves the desktop app through CI.

## Releasing the desktop app

The desktop app bundles the web app, so web changes reach desktop users only through a new desktop release.

1. In a PR to `staging`, bump `apps/commons-desktop/package.json` (desktop is the one place version numbers are edited by hand) and promote it to `main`.
2. Tag the promoted commit: `git tag -a desktop-vX.Y.Z <sha> -m "Agent Commons Desktop X.Y.Z" && git push origin desktop-vX.Y.Z`. The `Desktop` workflow builds, smoke-tests and publishes the installers.
3. Once the release is published, point the download links at it (`DESKTOP_VERSION` in `apps/commons-app/lib/desktop-release.ts`) through another PR to `staging`.

A merged version bump is not a release. Check that the tag and the GitHub release exist.

## Practical rules

- Published packages (`@agent-commons/sdk`, `@agent-commons/cli`, `@agent-commons/ui`) are versioned by changesets. Add one with `pnpm changeset`; never edit their `version` fields. When changesets reach `staging`, the Release workflow bumps the versions and changelogs and commits them to `staging` as `chore: version packages`. Promoting to `main` publishes the new versions to npm. Publishing uses npm trusted publishing, so there is no npm token: each package lists `release.yml` (and `release-staging.yml` for snapshots) as a trusted publisher on npmjs.com.
- The pre-commit hook runs `pnpm install` whenever a `package.json` is staged. If no dependency changed, make sure `pnpm-lock.yaml` did not change either. If a dependency did change, regenerate the lockfile with Node 22 and pnpm 9.15.3, the versions CI uses, and keep the diff limited to that dependency.
- Deploys roll back when the error alarms fire, and they count 4xx responses. A change that causes many 401s or 429s can block its own deploy. Deploy during quiet periods and check the alarms if a deploy fails.
- When AWS capacity is short (for example the Fargate vCPU quota blocks a deploy), pause Common Arcade services first. Agent Commons production always has priority.
