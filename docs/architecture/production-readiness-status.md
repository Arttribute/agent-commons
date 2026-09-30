# Production readiness status

This is the working release record for the Desktop, Web, Cloud, and Private Local continuity work. A passing local smoke test does not establish a production release.

## Implemented and locally checked

- New chats render the sent message immediately; title generation, steering, and stream reconnection paths are wired in both modes.
- The composer exposes provenance and Local web search in its add menu, uses the Knowledge brain icon, and shows a removable workspace folder.
- Projects have their own navigation, bounded scroll areas, document preview, folder import to Library, and tools for finding and reading other chats in the same project.
- Local agents can select downloaded Ollama chat models. Whisper speech input, SpeechT5 spoken output, and a default Tiny SD image model run on device. An optional Kokoro voice model and four voices are selectable in General settings; its cached inference generated audio in a local Node smoke test. The image and voice implementations have been exercised locally on macOS ARM.
- Local and Cloud file uploads accept files up to 25 MB in the UI path. Cloud browser uploads use short-lived, single-use, signed direct-upload tickets to avoid the Next.js body proxy. Local and CLI document reads return bounded chunks with offsets so a large PDF does not consume the entire model context. A 2.2 MB, 180-page PDF yielded 691,477 characters in a local extraction stress check; the Cloud extraction default now covers 500 pages and one million characters, and flags a partial extraction.
- Desktop tool execution now retains the login-shell command path and supports background CLI processes. A real Local model fixed a JavaScript function, ran Node to verify it, and read a 2.2 MB PDF in the scripted smoke journey.
- Cloud run events, steering, and CLI result handoff now use Postgres across API replicas. A run is registered in the shared store before inference begins; failed registration stops the run. This supports reconnection when the browser reaches a different healthy replica.
- A gated hosted-free model route, usage quota, and credit fallback exist in the API. The free model is hidden until the dedicated inference endpoint is configured and healthy.

## Release blockers

1. **Hosted free inference:** The GPU service has not been deployed or load tested. AWS login was refreshed, a $500 monthly account budget was created, and an eight-vCPU G/VT quota increase for `eu-west-2` is pending. The budget does not stop spending by itself. A verified model, cost guard, service deployment, and staging load test are still required. The free model remains hidden. See [hosted-free-model-service.md](./hosted-free-model-service.md).
2. **Durable long runs:** An API worker restart still interrupts its active agent. The shared store replays events and reports interruption; it does not resume execution on a new worker. A durable worker queue and restart recovery are required for the requested very long-running tasks.
3. **Media model choice:** Chat models are selectable; images accept compatible manually installed checkpoints; speech offers Whisper sizes, SpeechT5 voices, and a downloadable Kokoro voice option. A verified catalog and one-click runtime for alternate image and video generation models are not complete. Local video generation is not implemented.
4. **Platform coverage:** The image and voice runtime has been exercised on macOS ARM. Windows and Linux image binaries and the packaged app need their own end-to-end checks.
5. **Production verification:** The new Cloud run path has unit checks and a two-replica simulation against real Postgres SQL in PGlite. It still needs an authenticated staging journey with real storage, managed Postgres, GPU inference, and simultaneous API replicas. The macOS signing identity is expired, so a production signed Desktop release cannot be published yet. An unsigned packaged macOS candidate passed its launch smoke.
6. **Workspace baseline:** A full API typecheck in this working tree currently fails on unrelated untracked `game-thumbnails` and `common-tool.service.spec` files. The production changes typecheck with those files excluded; resolve or isolate that work before a clean release build.

Do not merge or deploy these changes as a complete production release until the blockers above are closed and the exact release artifact passes smoke tests.
