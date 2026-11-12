# @agent-commons/ui

## 0.6.0

### Minor Changes

- 8a6d4c3: Add configurable event registration, verified payment receipts and an embedded public programme guide for custom project pages.

## 0.5.0

### Minor Changes

- 571b4e5: ProjectPageFrame accepts a server-created `session` (nonce and host origin) so hosts can render the page frame in their server HTML and start loading it before hydration. `@agent-commons/ui/page-bridge` exports `projectPageRequestOrigin` for server components.

## 0.4.0

### Minor Changes

- 0ab3ee6: Add a sandboxed ProjectPageFrame with a source-checked, nonce-bound bridge that can request a reviewed chat draft without exposing host credentials or running an agent.

## 0.3.0

### Minor Changes

- 71dc78c: `CompiledArtifactFrame` can report the elements at a point or inside a region of the preview (`inspect`), with selector, text, attributes, image source, and icon, and accepts `recordingControls={false}` to hide the record and replay bar.
