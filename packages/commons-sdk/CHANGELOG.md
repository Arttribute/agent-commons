# @agent-commons/sdk

## 0.5.0

### Minor Changes

- 94c1e85: Add the native Commons Copilot API surface and make `agc chat` discover the user's platform-provisioned default agent when no explicit agent is configured.
- 4f02f4c: Add billing and feature-flag surfaces.

  SDK: `client.billing` (subscription, entitlements, subscribe, topup, portal) and
  `client.flags` (all, evaluate), plus `SubscriptionInfo`, `PlanEntitlements`,
  `PlanKey`, and `FlagEvaluation` types.

  CLI: `agc credits` (balance, ledger) and `agc billing` (status, upgrade, topup).

- 8c43cb9: Add typed workflow field mappings, multi-agent coordination metadata, and the complete authenticated workflow execution lifecycle to the public TypeScript SDK surface.
- 4506380: Add the string-first `WorkflowValue` envelope (`WorkflowValueKind`, `WorkflowValue`, `OutputPresentation`) to the public SDK surface. This is the presentation-aware contract every workflow node output is normalized to, powering the context-aware results interpreter in the studio.

## 0.4.0

### Minor Changes

- 23bc28a: Add OAuth connection management: `client.oauth` namespace in the SDK
  (listProviders, listConnections, connect, refresh, test, revoke) and a new
  `agc connections` command (list, providers, connect, test, revoke) so users
  can connect and inspect the accounts (Google Workspace, GitHub, Slack, …)
  their agents act with.

## 0.3.0

### Minor Changes

- 4f65bc0: Add `run_started` stream event type plus `runId`/`seq` fields on `StreamEvent`. Streaming runs are now resumable: every SSE event carries the run's `runId` and a monotonic `seq`, and a dropped stream can be re-attached via `POST /v1/agents/runs/:runId/stream` with `{ after: <last seen seq> }`.

## 0.2.3

### Patch Changes

- Auto patch release

## 0.2.2

### Patch Changes

- Auto patch release

## 0.2.1

### Patch Changes

- Auto patch release

## 0.2.0

### Minor Changes

- fb271d2: Make autonomous execution the default for local agent work, add caller-defined CLI tool catalogs to the SDK, fix local `--no-stream` runs so tool results can complete, and expand provider configuration for OpenRouter, xAI, Ollama, and custom OpenAI-compatible endpoints.

## 0.1.13

### Patch Changes

- Auto patch release

## 0.1.12

### Patch Changes

- Auto patch release

## 0.1.11

### Patch Changes

- Auto patch release

## 0.1.10

### Patch Changes

- Auto patch release

## 0.1.9

### Patch Changes

- Auto patch release

## 0.1.7

### Patch Changes

- Auto patch release

## 0.1.6

### Patch Changes

- Auto patch release

## 0.1.5

### Patch Changes

- Auto patch release

## 0.1.4

### Patch Changes

- Auto patch release

## 0.1.3

### Patch Changes

- c65aa7e: Auto patch release

## 0.1.2

### Patch Changes

- 8840459: Automated patch release.

## 0.1.2

### Patch Changes

- Automated patch release.

## 0.1.1

### Patch Changes

- Automated patch release.
