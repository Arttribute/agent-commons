# Workflows: String-First Redesign & Context-Aware Results

**Status:** Proposal / design
**Author:** Engineering
**Scope:** `apps/commons-api` (workflow executor), `apps/commons-app` (studio editor + results UI), `packages/commons-sdk` (shared types), `packages/agc-cli`

---

## 1. Goal

Move the workflow authoring and runtime data-contract toward a **largely string-based system** in the spirit of ImagineKit, while:

1. **Keeping** the simple node/connector experience we already have (icon-tile nodes, colored handles, hover cards).
2. Making **multi-agent coordination simple and mostly string-driven**.
3. Adding a **context-aware results interpreter** in `studio/workflows/[workflowId]` that renders each result by what it *is* — an image as an image, text as formatted text, audio/video with players, an email or calendar event as an interactive card, generic tool output as a clean card — and **normalizes arbitrary custom-tool I/O** into that presentation layer.

Non-goal: throwing away the robust server-side execution engine. The move to "string-based" is about the **data contract, the authoring UX, and the presentation layer** — not a downgrade of runtime capability.

---

## 2. How the two systems work today

### 2.1 Agent Commons workflows (current)

**Data model** — `workflow.definition` (jsonb): `{ startNodeId, endNodeId, nodes[], edges[] }`.
- Nodes: `{ id, type, toolId?, config?, position, label? }` where `type ∈ tool | agent_processor | workflow | input | output | condition | transform | loop | human_approval`.
- Edges: `{ id, source, target, sourceHandle?, targetHandle?, mapping?, targetTypes?, mappingMode? }`.

**Type system** — strong. `WorkflowDataType = string | number | boolean | object | array | null | any` (`lib/workflows/type-mapping.ts`). Ports are extracted from each tool's JSON Schema, handles are colored per type, and every edge coerces values at runtime via `coerceWorkflowValue` (`workflow-executor.service.ts`). Nested object fields are flattened into selectable dotted paths.

**Executor** — `WorkflowExecutorService.executeGraphWalker()`. This is genuinely capable:
- Parallel execution of independent frontier nodes (in-degree tracking).
- Conditional branching via `condition` nodes with **dead-edge** propagation and skip propagation.
- `transform` / `loop` nodes, nested `workflow` nodes (depth-limited to 2).
- Human-in-the-loop `human_approval` nodes that **pause and resume** (`HumanApprovalPauseError`, `pausedNodeOutputs`, approval tokens).
- Per-node results persisted to `workflow_execution.nodeResults`; final output via `definition.outputMapping` or last completed node.

**Agent coordination** — `agent_processor` nodes. `AgentCoordinationConfig` carries `architecture` (sequential / hierarchical / peer_to_peer / hybrid), `role`, `reportsTo`, `peerNodeIds`, `handoffPolicy`, `contextPolicy`, `sessionPolicy`, `checkIn`. Notably, the coordination contract is **already serialized to a string and appended to the agent's instruction prompt** — the mechanism is string-based; the *authoring UI* is what's heavy.

**Results UI** — `test-panel.tsx` + `workflow-runs-panel.tsx`. Results are `JSON.stringify(..., null, 2)` inside `<pre>` blocks. Per-node "Step Results" are raw-JSON accordions. **No content-type awareness at all** — an image URL, a paragraph of prose, an audio data-URI, and a sent-email receipt all render as identical grey JSON.

### 2.2 ImagineKit (reference)

**Data model** — nodes: `{ node_id, type, name, data: { inputs[], outputs[], instruction?, memory?, knowledgeBase?, context? } }`. Ports are `{ id, label, value }`. A **separate `uiComponents` layer** describes presentation independently of logic.

**String-first** — every `value` is a **string**: prose, URLs, and base64 data-URIs for images/audio all travel as strings. There is no type system and no coercion.

**Label-based data flow** — `RuntimeEngine.propagateDataToConnectedNodes()`: for each outgoing edge, find the target input by handle, then match the **source output whose `label` equals the target input's `label`**, falling back to the first output. Forgiving; wiring never "fails to type-check."

**LLM node = the coordination primitive** — an LLM node concatenates its input values, takes a natural-language `instruction`, and an `outputFormat` = the comma-joined list of its **output labels**; the model returns JSON keyed by exactly those labels. Named string outputs. `memory` is a running list of `{ inputs, outputs }` pairs (with base64 filtered out). Multi-agent behavior is just **a chain of LLM nodes** wired together.

**Runtime engine** — a client-side, event-driven execution stack (`nodeExecutionStack`) that propagates recursively until empty. Triggered by user events (button, form submit).

**Content-type-aware UI** — `renderUIComponent()` is a `switch` on component `type`: `imageDisplay → <img>`, `audioPlayer → <audio>`, `textOutput → text`, `chatInterface → chat`, plus `flipCard`, `wordSelector`, `camera`, `fileUpload`, `sketchPad`, etc. **The presentation type is declared by the node/component, not sniffed from the value.** This is the pattern we want for the results interpreter.

### 2.3 Side-by-side

| Concern | Agent Commons (now) | ImagineKit | What we want |
|---|---|---|---|
| Value model | Typed (`string/number/object/…`) | String only | **String-first with a light type tag** |
| Connections | Typed handles must line up; per-edge coercion | Label matching, forgiving | **Label auto-map default; typed refinement optional** |
| Multi-agent | `agent_processor` + rich coordination config (string contract under the hood) | Chain of LLM nodes + NL instruction | **String/instruction-first authoring; keep the engine** |
| Runtime | Server DAG: parallel, conditional, HITL, nested | Client event-stack | **Keep the server DAG** |
| Results UI | Raw JSON dumps | Per-type components | **Normalized, per-kind renderer registry** |
| Presentation | Coupled to node type | Separate `uiComponents` layer | **Separate, data-driven presentation descriptors** |

---

## 3. The core idea: a string-first **value envelope**

Introduce one universal shape for every value that flows on an edge, is persisted in `nodeResults`, or is shown as final output:

```ts
type WorkflowValueKind =
  | "text" | "markdown" | "number" | "boolean" | "json"
  | "image" | "audio" | "video" | "file" | "link"
  | "email" | "calendar_event" | "tool_result";

interface WorkflowValue {
  kind: WorkflowValueKind;
  /** ALWAYS present. The canonical string the whole system reads/wires/feeds to LLMs. */
  text: string;
  /** Structured payload when kind !== text — { url, mime, fields, … }. Large binaries by URL, never inline base64. */
  data?: Record<string, any>;
  mime?: string;
  /** Provenance + render hints: source tool/agent, label, presentation descriptor id. */
  meta?: Record<string, any>;
}
```

Why this shape gives us both worlds:

- **String-first (ImagineKit's simplicity).** `text` is always present, so *anything can be wired to anything* and degrades gracefully to text. Agents and LLM nodes always consume `text` — they are never handed a base64 blob. Label matching operates on names, and coercion becomes trivial (`String(value)` already lives in `.text`).
- **Presentation-aware (the results interpreter).** `kind` + `data`/`mime` tell the renderer exactly how to display the value — no fragile guessing.
- **One contract everywhere.** Same type in `commons-api`, `commons-sdk`, `commons-app`, `agc-cli`. The frontend stays dumb; the backend produces envelopes.

### 3.1 Normalization at the boundary

A single `normalizeToolOutput(raw, hints) → WorkflowValue[]` function turns any tool/agent/custom-tool output into one or more envelopes, in priority order:

1. **Explicit render hints** — an optional `outputPresentation` descriptor on the tool definition (see §6). This is how **custom user tools** declare "my `imageUrl` field is an image, my `body` field is markdown."
2. **MIME / URL heuristics** — `data:image/*`, `.png/.jpg`, `audio/*`, `video/*`, http(s) links, ISO-datetime + attendees ⇒ `calendar_event`, `{to, subject}` ⇒ `email`, etc.
3. **Fallback** — object ⇒ `json`, primitive ⇒ `text`. (This is exactly today's behavior, so **old runs still render**.)

Normalization runs **in the backend executor** as each node completes, before persisting. Benefits: envelopes are available to *downstream agents mid-graph* (an agent consuming an image node receives `.text` = a description/URL, not raw bytes — the lesson ImagineKit encodes by filtering base64 out of memory), and the frontend never re-derives anything.

---

## 4. Connections: label-first, typing optional

Change the **default** connect behavior to ImagineKit-style **name/label auto-mapping**: dropping an edge from A→B auto-maps ports whose names match; anything unmatched passes the whole value as `.text`. Wiring **never blocks**.

- Keep colored handles — they now indicate `kind` for delight, not as a gate.
- Keep the existing typed edge `mapping` / `targetTypes` as an **advanced refinement** in the node details panel for power users who want exact field wiring. Existing typed edges keep working unchanged.
- Name collisions (two outputs sharing a label) resolve by deterministic precedence (first declared) with an explicit override available.

Net effect: the simple path gets dramatically simpler; the precise path is still there when wanted.

---

## 5. Multi-agent coordination, made string-simple

Keep `agent_processor` nodes and the powerful executor, but **simplify the authoring surface to three things**:

1. **Pick an agent.**
2. **Write an instruction** (natural language) — this is the primary control, exactly like an ImagineKit LLM node.
3. **Name the outputs you want** (labels) — the node asks the agent to return those named fields; they become the node's output ports (envelopes).

Coordination *topology becomes emergent from the graph*, which is simpler to teach than a config form:
- **Sequential** = wire agent A → agent B.
- **Parallel/fan-out** = one source → several agents.
- **Supervisor / reduce** = several agents → one fan-in agent whose instruction says "synthesize the inputs."

The existing `AgentCoordinationConfig` stays as an **optional advanced panel** (and still serializes into the prompt as it does today). Most users never open it.

*Optional later:* a **"Team" macro node** — one node representing an orchestrator + N specialists with a single instruction, which expands to sub-nodes under the hood.

---

## 6. The context-aware results interpreter

The highest-visibility win. Replace the `<pre>`-JSON dumps with a **renderer registry** keyed by `WorkflowValueKind`, used for **both** final output and per-node step results.

```
resultRenderers: Record<WorkflowValueKind, ResultRenderer>
```

| kind | Renders as |
|---|---|
| `text` / `markdown` | Cleanly formatted text (safe markdown) |
| `image` | `<img>` with lightbox |
| `audio` | `<audio>` player |
| `video` | `<video>` player |
| `file` | Download/preview card |
| `link` | Rich link chip |
| `email` | Email card — to / subject / body, "sent ✓" state |
| `calendar_event` | Event card — title, time, attendees, "add to calendar" |
| `tool_result` | Generic tool card: headline + key fields + expandable raw |
| `json` / unknown | Pretty JSON (today's behavior — the safety net) |

- **Registry, not a hard switch** (ImagineKit's `renderUIComponent`, but data-driven and extensible). New kinds = new registry entries.
- **Custom tools plug in** via an optional `outputPresentation` descriptor on the tool definition: `{ kind, fieldMap: { title: "subject", body: "text", … } }`. This is how we "normalize custom user tools with explicit input/output types" — the tool declares intent once; the interpreter and normalizer both honor it.
- Applies per step, so each node in a run shows a rich inline preview, not grey JSON.

**Where it lives:** a new `components/workflows/result/` module (`WorkflowResult.tsx` + one small component per kind + `renderer-registry.ts`), consumed by `test-panel.tsx` and `workflow-runs-panel.tsx`.

---

## 7. Trade-offs (benefits & downsides)

### String-first + label matching
**Benefits:** far simpler UX; forgiving wiring; no "type-mismatch" dead-ends; approachable for non-technical users; LLMs are natively string; trivial coercion; graceful degradation.
**Downsides / mitigations:**
- *Loss of compile-time safety → silent mis-wiring.* Mitigate with label auto-map + optional typed refinement + **non-blocking validation warnings** (never hard errors).
- *Name collisions are ambiguous.* Deterministic precedence + explicit override.

### Typed-envelope presentation
**Benefits:** rich, context-aware rendering; extensible registry; single contract across api/SDK/app/CLI; normalizes custom tools.
**Downsides / mitigations:**
- *Needs a normalization layer + migration.* Make envelopes **additive** (keep raw `output`, add `value`); fallback renderer covers legacy runs.
- *Envelope adds payload.* Store **large binaries by URL/ref, never inline base64** (also a cross-system robustness requirement).

### Keep the server DAG engine
**Benefits:** preserve parallelism, conditionals, HITL, nested workflows — no capability regression.
**Downside:** ImagineKit's client event-stack engine is *not* a drop-in replacement; we adopt its **authoring & presentation ideas**, not its runtime. Being explicit about this avoids an accidental rewrite.

---

## 8. Cross-system robustness concerns

- **Binary size:** never inline base64 in envelopes or agent memory; use URLs + lazy fetch (ImagineKit filters base64 out of memory for this reason).
- **Security:** sanitize rendered markdown/tool cards; no raw HTML injection; audio/video/images only from allowed origins; email/event cards are read-only previews unless an explicit action tool is wired.
- **Agent inputs:** always pass `.text` to agents so they never receive blobs.
- **Determinism:** label matching must be stable across re-renders (sort by declaration order); handle ids must stay stable for saved workflows.
- **Backward compatibility:** legacy `nodeResults` with raw `output` and typed edges must keep executing and rendering unchanged.

---

## 9. Phased implementation plan

Each phase is independently shippable; the value envelope is additive throughout.

- **Phase 0 — Shared types.** `WorkflowValue` + `WorkflowValueKind` in `commons-sdk`, re-exported to api/app/cli. `outputPresentation` descriptor type on tool definitions.
- **Phase 1 — Backend normalization.** `WorkflowValueService.normalize()` in `commons-api`; executor wraps each node output into `value: WorkflowValue[]` alongside existing raw `output`; URL-ify large binaries. No UI change yet.
- **Phase 2 — Results interpreter.** Renderer registry + per-kind components; wire into `test-panel` and `workflow-runs-panel` (fallback = today's JSON). **Biggest visible win; ships on top of Phase 1.**
- **Phase 3 — Label-first connections.** Auto-map ports by name on edge create; keep typed refinement in details panel; validation warnings instead of blocks.
- **Phase 4 — String-first agent nodes.** Simplify `agent_processor` authoring to agent + instruction + named outputs; move `AgentCoordinationConfig` to an advanced panel; emergent topology from wiring.
- **Phase 5 — Polish.** `outputPresentation` for custom tools; string-pair memory; optional Team macro node.

**Recommendation:** ship **incrementally and additively** (not a rewrite). Phases 0→1→2 deliver the most user-visible improvement (the results interpreter) with zero risk to existing workflows, and lay the envelope foundation everything else builds on.

---

## 10. Open decisions

1. **Presentation location** — presentation descriptors on the *tool* definition (reusable, recommended) vs. on the *node* (per-workflow override). Suggest: tool-level default + optional node override.
2. **Typed handles** — keep colored handles as delight-only, or hide types entirely for the "simple" preset and expose in an "advanced" toggle?
3. **Team macro node** — build now (Phase 4) or defer until the string-first agent node proves out?
4. **Migration** — leave legacy runs as fallback-JSON forever, or backfill-normalize historical `nodeResults`?
