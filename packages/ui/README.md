# @agent-commons/ui

Shared source components used by Agent Commons and Common Arcade. Import
`@agent-commons/ui/styles.css` once and add `@agent-commons/ui` to Next.js
`transpilePackages`. No application credentials or product dependencies.

`CanvasShell` provides a full-height workspace. `CompiledArtifactFrame` renders
compiled HTML or HTTPS previews in an opaque-origin sandbox. `AnnotationLayer`
provides normalized point/region drawing and revision-pinned notes.

Arcade initially consumes a versioned npm pack of this directory from its
`vendor` directory, so both deployments use exactly the same source. Update the
version and tarball together when changing the shared contract.
