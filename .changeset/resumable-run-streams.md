---
"@agent-commons/sdk": minor
---

Add `run_started` stream event type plus `runId`/`seq` fields on `StreamEvent`. Streaming runs are now resumable: every SSE event carries the run's `runId` and a monotonic `seq`, and a dropped stream can be re-attached via `POST /v1/agents/runs/:runId/stream` with `{ after: <last seen seq> }`.
