# @agent-commons/sdk

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
