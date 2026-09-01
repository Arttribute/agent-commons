# Canvas media studio

Canvas is Agent Commons' provider-neutral workspace for generating, analysing,
annotating, transforming, and composing media. Its canonical route is
`/studio/canvas/[artifactId]`; an existing Library artifact is the entry point,
so chat artifacts, uploads, agent outputs, and future custom apps all share the
same access and provenance boundary.

## Product shell

- The collapsible left panel is capability-driven: media kind, provider/model,
  prompt, source artifacts, provider settings, quote, and generation action.
- The centre renders the active immutable artifact revision. Images support
  point/region notes; time-based media supports millisecond ranges and a
  timeline. Panels collapse for inspection-focused work.
- The collapsible right panel groups annotations, Copilot hand-off, revision
  history, provenance, and export. Annotation coordinates are normalized to
  the artifact rather than screen pixels, which keeps them stable across
  responsive layouts and usable by agents.
- Every generated output becomes a private Library item and a new Canvas
  revision. The original and all prior revisions remain addressable.

## Provider plugin contract

`MediaModelDescriptor` is the public catalog schema. A descriptor owns a stable
Commons `modelKey`, the provider's exact `modelId`, modality, accepted inputs,
settings schema, capabilities, and pricing evidence. The stable key is required
because upstream identifiers can collide across modalities (for example Kling
3.0 Omni image and video).

`MediaProviderAdapter` is deliberately small:

```ts
interface MediaProviderAdapter {
  id: string;
  supports(modelId: string): boolean;
  generate(request: MediaGenerateRequest): Promise<MediaProviderOutput>;
}
```

Adding a provider therefore requires one adapter, catalog descriptors, DI
registration in `MediaModule`, and contract tests. Canvas, Commons Copilot,
workflow tools, Library persistence, credit settlement, and provenance consume
the same catalog automatically. Provider-specific settings stay declarative;
the UI does not contain a form per vendor.

Agents use the same boundary through `listMediaModels`, `getCanvasProject`,
`annotateCanvas`, and `generateMedia`. These are ordinary Commons tools, so they
are discoverable in the Tools surface and callable from workflow tool nodes as
well as Commons Copilot.

The initial catalog covers Google Gemini image/speech/music and Veo, current
non-retiring Kling image/video families, and BytePlus ModelArk Seedream and
Seedance families. A provider can be present but unconfigured. Models without a
verified tariff are also present but unavailable until a positive operator
override is supplied.

## Private input handling

Canvas authorizes every selected Library item before processing. Google receives
inline bytes through its SDK. Remote asynchronous providers receive a short-lived
signed object URL where possible so large video/audio files are not embedded in
JSON. The URL is created only after the user or agent explicitly selects that
artifact for that generation. Prompts are hashed in revision metadata; full
capture is controlled by the existing provenance policy.

## Credit policy

The quote endpoint converts the smallest defensible provider estimate to
Commons credits using:

`ceil(provider USD cost * CREDIT_UNITS_PER_USD * MODEL_COST_MARKUP)`

Generation then follows a four-stage ledger protocol:

1. Reserve the quoted credits before contacting the provider.
2. Persist provider operation and billing evidence on the generation job.
3. Capture exactly once using `capability:media:{jobId}:capture` after provider
   success. Usage-priced models settle from returned usage (Seedance completion
   tokens); catalog-priced models settle from successful output quantity.
4. Release the reservation on provider failure. If a provider succeeds but
   local artifact persistence fails, retain the provider charge and mark that
   exceptional state on the job.

The model's pricing source, estimate, provider usage, unit price, USD cost, and
credit quote are stored on the job and generated Library metadata. The same USD
cost is written to the provenance trace. This is an auditable billing trail,
not a UI-only estimate.

Public tariff gaps are fail-closed. Configure overrides as JSON keyed by
`modelKey` (preferred) or `modelId`:

```bash
KLING_MEDIA_PRICE_USD_JSON='{"kling:image:kling-image-o1":0.08}'
BYTEPLUS_MEDIA_PRICE_USD_JSON='{"byteplus:video:dreamina-seedance-2-5-260628":7}'
```

## Runtime configuration

Provider credentials:

- Google: `GOOGLE_API_KEY`
- Kling: `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`
- BytePlus ModelArk: `BYTEPLUS_ARK_API_KEY`

Staging ECS injects them conditionally with `GOOGLE_MEDIA_ENABLED`,
`KLING_MEDIA_ENABLED`, and `BYTEPLUS_MEDIA_ENABLED`. A flag must stay false
until its corresponding runtime-secret keys exist; this prevents an ECS task
definition from referencing a missing Secrets Manager JSON member.

Use test/sandbox provider accounts and Stripe test mode on staging. Never copy
production provider credentials into a pull request, build log, Vercel variable,
or browser bundle.

## Provenance and revisions

Canvas maps naturally to the existing provenance-first model:

- Library items are immutable artifact entities.
- Canvas revisions capture parent revision, all input artifact IDs, operation,
  provider/model, prompt hash, settings, actor, and trace ID.
- Annotations are first-class contextual records linked to one revision, with
  normalized geometry and optional millisecond ranges.
- Generation runs record authorization inputs, model action, output revision,
  duration, billing, and completion/failure.

This preserves a Git-like history for media without pretending that binary
assets have text diffs. A future C2PA/ProvenanceKit publisher can sign an export
from the same trace and input graph.
