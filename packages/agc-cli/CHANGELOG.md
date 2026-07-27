# @agent-commons/cli

## 0.4.0

### Minor Changes

- a22e9dc: Bring the SDK and CLI up to date with the current Agent Commons platform:

  - add typed files, library, spaces, projects, activity, logs, goals, audio,
    liaison, billing, OAuth, session, workflow, tool-key, and tool-permission
    capabilities;
  - add Commons Identity developer projects and project-scoped API-key lifecycle
    support;
  - enforce create-only agent credentials independently from general agent-write
    access;
  - make browser-approved Commons account sign-in the standard CLI auth flow;
  - add CLI commands for developer keys, library files, code projects, connection
    maintenance, and session lifecycle;
  - refresh terminal presentation, package metadata, security behavior, and npm
    documentation.

- 94c1e85: Add the native Commons Copilot API surface and make `agc chat` discover the user's platform-provisioned default agent when no explicit agent is configured.
- 4f02f4c: Add billing and feature-flag surfaces.

  SDK: `client.billing` (subscription, entitlements, subscribe, topup, portal) and
  `client.flags` (all, evaluate), plus `SubscriptionInfo`, `PlanEntitlements`,
  `PlanKey`, and `FlagEvaluation` types.

  CLI: `agc credits` (balance, ledger) and `agc billing` (status, upgrade, topup).

### Patch Changes

- Updated dependencies [a22e9dc]
- Updated dependencies [94c1e85]
- Updated dependencies [4f02f4c]
- Updated dependencies [8c43cb9]
- Updated dependencies [4506380]
  - @agent-commons/sdk@0.5.0

## 0.3.0

### Minor Changes

- 23bc28a: Add OAuth connection management: `client.oauth` namespace in the SDK
  (listProviders, listConnections, connect, refresh, test, revoke) and a new
  `agc connections` command (list, providers, connect, test, revoke) so users
  can connect and inspect the accounts (Google Workspace, GitHub, Slack, …)
  their agents act with.

### Patch Changes

- Updated dependencies [23bc28a]
  - @agent-commons/sdk@0.4.0

## 0.2.4

### Patch Changes

- Updated dependencies [4f65bc0]
  - @agent-commons/sdk@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies
  - @agent-commons/sdk@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies
  - @agent-commons/sdk@0.2.2

## 0.2.1

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.2.1

## 0.2.0

### Minor Changes

- fb271d2: Make autonomous execution the default for local agent work, add caller-defined CLI tool catalogs to the SDK, fix local `--no-stream` runs so tool results can complete, and expand provider configuration for OpenRouter, xAI, Ollama, and custom OpenAI-compatible endpoints.

### Patch Changes

- Updated dependencies [fb271d2]
  - @agent-commons/sdk@0.2.0

## 0.1.18

### Patch Changes

- Auto patch release

## 0.1.17

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.13

## 0.1.16

### Patch Changes

- Auto patch release

## 0.1.14

### Patch Changes

- Auto patch release

## 0.1.13

### Patch Changes

- Auto patch release

## 0.1.12

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.12

## 0.1.11

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.11

## 0.1.10

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.10

## 0.1.9

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.9

## 0.1.7

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.7

## 0.1.6

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.6

## 0.1.5

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.5

## 0.1.4

### Patch Changes

- Auto patch release
- Updated dependencies
  - @agent-commons/sdk@0.1.4

## 0.1.3

### Patch Changes

- c65aa7e: Auto patch release
- Updated dependencies [c65aa7e]
  - @agent-commons/sdk@0.1.3

## 0.1.2

### Patch Changes

- 8840459: Automated patch release.
- Updated dependencies [8840459]
  - @agent-commons/sdk@0.1.2

## 0.1.2

### Patch Changes

- Automated patch release.
- Updated dependencies
  - @agent-commons/sdk@0.1.2

## 0.1.1

### Patch Changes

- Automated patch release.
- Updated dependencies
  - @agent-commons/sdk@0.1.1
