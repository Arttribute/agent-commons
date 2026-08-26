# Provenance-first Agent Commons

Agent Commons records an append-only trajectory for every agent run. The record
is useful without a blockchain, and export/anchoring remain replaceable sinks.
The chat hot path never waits on provenance storage or ProvenanceKit.

## Defaults and disclosure

- `metadata` is the default capture mode. It stores event shape, hashes,
  attribution, model/tool identifiers, token use, cost and timing—not raw text.
- `full` is an explicit per-run choice and applies bounded secret redaction.
- Private model reasoning/chain-of-thought is never stored. The trajectory shows
  that a model step happened, its disclosed input/output, timing and usage.
- `off` is available per run.
- On-chain anchoring is off by default, separately environment-gated, and must be
  requested by the user. Content stays off-chain; the sink receives an EAA
  bundle digest.

## Runtime path

```text
agent callbacks -> bounded in-memory queue -> batched local DB writes
                                      `----> optional ProvenanceKit batch sink
                                                     `----> optional chain anchor
```

The queue is bounded and records dropped-event counts under overload. Inserts
are batched (`200` events or `40ms` by default), retry once, and degrade without
blocking tokens or tools. The UI is lazy: chat is unchanged until the user opens
the Trajectory tab; active trajectories poll while a run is in progress.

## Plugin contract

The local store is the default durable provider. ProvenanceKit is an asynchronous
EAA v2 export provider. Chain anchoring is an optional ProvenanceKit capability,
not a core dependency. New sinks should consume the same `ProvenanceBundle` and
must preserve three rules: explicit disclosure, idempotent writes, and no work
on the synchronous model/tool path.

The event vocabulary maps to W3C PROV's entity/activity/agent concepts and uses
OpenTelemetry-style trace/span identifiers and GenAI event names. EAA actions,
resources, entities and attributions are retained for portable export. Media
artifacts may additionally carry C2PA manifests, while release artifacts can be
attested through in-toto/SLSA independently of conversational provenance.

## Operations

The schema is introduced by migration `023_agent_provenance.sql`. Deploy the API
migration before the web Trajectory UI. Start staging with local metadata mode;
then configure and canary `PROVENANCEKIT_EXPORT_ENABLED`, and enable
`PROVENANCE_ONCHAIN_ENABLED` only after a funded staging signer and retention/
consent review are in place.
