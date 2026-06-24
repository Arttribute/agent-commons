# Commons API Platform

The public API contract is:

```text
https://api.agentcommons.io/v1
```

The gateway is a policy and routing layer. Agent Commons, Common OS, Commons
Identity, Courses, and future services retain independent codebases,
deployments, databases, scaling, and failure boundaries.

## Route ownership

| Public route | Internal owner |
|---|---|
| `/v1/agents`, `/v1/tasks`, `/v1/workflows`, `/v1/tools`, `/v1/memory` | Agent Commons |
| `/v1/compute/fleets`, `/v1/compute/agents`, `/v1/compute/events` | Common OS |
| `/v1/activity/events` | Agent Commons activity |
| `/v1/compute/activity/events` | Common OS activity |

## Credentials

- Browser applications: OAuth Authorization Code with PKCE.
- CLI: OAuth Device Authorization.
- Developer servers: project keys beginning with `csk_live_` or `csk_test_`.
- Internal services: OAuth Client Credentials.
- Agent workloads: agent credentials; legacy Common OS agent tokens remain
  supported during migration.
- Wallet operations: Privy is requested only when wallet functionality is
  needed.

Project keys are stored as SHA-256 hashes and shown once. Projects belong to a
`wsp_*` workspace and isolate scopes, environment, usage, and future billing.

## Security boundary

Public credentials terminate at the gateway. The gateway forwards a
short-lived HMAC-signed principal envelope containing:

- actor ID and actor type
- workspace and project IDs
- granted scopes
- request ID and timestamp

Product services independently validate the signature and timestamp. Direct
service endpoints retain legacy authentication during rollout and can later be
restricted to gateway/service traffic.

## Standard behavior

- Every response includes `x-request-id`.
- Errors use `{ "error": { "type", "message", "requestId" } }`.
- Project usage is recorded asynchronously and never blocks a request.
- Route scopes distinguish read, write, run, compute, activity, and usage.
- Existing direct API URLs and old keys remain compatibility paths until their
  announced deprecation date.

Common OS WebSocket fleet streams temporarily continue through the Common OS
service endpoint. Moving the stream upgrade path behind the public gateway is
a follow-up transport migration and does not affect REST API convergence.
