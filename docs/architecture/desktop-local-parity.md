# Desktop local parity

## Product contract

The desktop app has one Commons experience. Cloud and Private Local select the
provider for model inference, persistence, and tools. Navigation, chat,
artifacts, Knowledge Spaces, agents, tasks, workflows, settings, and account
chrome must be the same React experience in both modes. Local mode must work
with cloud networking blocked and must not silently call cloud services.

## Current architecture and gap

Cloud mode loads `commons-app` and its Next.js routes, authentication, and
NestJS API. Private Local loads a second Vite renderer
(`components/desktop/private-workspace.tsx`) and an Electron runtime
(`apps/commons-desktop/src/runtime.ts`). These independently implement chat,
agents, spaces, tasks, workflows, and apps. Matching colors and navigation
cannot make their behavior equivalent. Cloud pages still depend on remote API
routes and auth, while local pages use a separate state shape.

The shared navigation component and desktop file tool bridge are initial
integration points. They do **not** satisfy the parity contract on their own.

The desktop now keeps one native window and switches between retained Cloud
and Local `WebContentsView`s. This removes window churn, but the two views
still mount different React roots. It is a transition state, not the target
architecture. Shared React pieces currently include the mode switch, agent
overview screen (including paging), chat message and composer controls, page header, navigation
and More menu, routes, and general workspace settings. New feature work should extend these shared
pieces and the provider contract, rather than adding a third local page.

Presentation preferences have an explicit cross-mode allowlist. The agent
page count is shared and persisted in the desktop store. Local pinned app IDs
stay local: Cloud IPC only receives the page count, including preference
change events. Workspace content, local paths, chats, and artifacts must
never be added to this allowlist. Cloud desktop file tools are a separate,
user-selected operation whose results intentionally enter the cloud chat.
Local model requests are restricted to loopback, and Local renderer networking
is blocked. User-approved terminal commands may themselves use the network;
the UI states that limit rather than implying an OS-wide network firewall.

## Required migration

1. Define a mode-neutral application service contract for accounts, agents,
   conversations, Knowledge Spaces, artifacts, tasks, workflows, tools, and
   settings. Every screen should call this contract, including the current
   cloud screens.
2. Implement a cloud provider backed by existing API routes and a local
   provider backed by Electron IPC. Use one React route and component tree in
   both modes. Remove the independent Private Workspace pages once each route
   is connected to the shared contract.
3. Move agent orchestration rules, tool schemas, event shapes, and conversation
   behavior into a shared core used by the cloud service and local runtime.
   Model selection and persistence remain provider-specific. In Private Local,
   the model adapter must target loopback only, and every artifact and
   Knowledge Space must persist on the user's device.
4. Cache a display-only account snapshot for offline chrome. Never cache
   session tokens as part of local workspace state. Show locally available
   agents and resources on the same pages as cloud resources.
5. Build a parity suite that runs the same scripted journeys against both
   providers: ordinary chat; real file reads, edits, and commands; artifact
   creation; Knowledge Space search; agent edits; task and workflow execution;
   restart and offline persistence; and a network-denied local run.

## Release gate

Do not label Private Local as equivalent to Commons Cloud until the same UI
tree runs with the local provider, the parity suite passes, and a real installed
local model completes the scripted journeys. A renderer build or a mocked model
response alone does not meet this gate.

## Local account profiles

Desktop selects a local profile using the authenticated Commons principal ID.
Names and email addresses do not determine ownership. Each profile contains its
own agents, chats, Library files, canvas versions and notes, Knowledge Spaces,
tasks, app settings, connection credentials, preferences and folder grants.
Signing out selects a separate guest profile; signing back in restores the
account's existing data. Local account snapshots contain display information,
not authentication tokens.

On upgrade, the existing local profile remains at its original location so its
absolute artifact paths remain valid. It belongs to the account recorded in
that profile, or to the original guest when no account was recorded. Other
accounts get separate directories under `private-local/accounts/`. Model weights,
voice weights and the managed Python interpreter are shared downloads; their
outputs and per-agent choices belong to the active profile.

Switching accounts closes old tasks, approval requests, model streams and app
servers before selecting the new profile. Renderer state is recreated to clear
canvas selections, chat caches and folder context. Connected-app requests verify
that the cloud session belongs to the current local profile. An old local run
cannot use a newly signed-in account's connections.

The loopback server gives the native process a private request capability for
account verification and connected-app calls. It is never exposed to the
renderer, and those routes still require the authenticated session. Local
renderer cloud APIs remain blocked; CSRF and sign-out remain available so
logging out can actually select the guest profile.

Native verification decodes the encrypted desktop session without refreshing
tokens or writing cookies. This prevents a pending identity read from restoring
an old cookie after sign-out. Every local IPC call carries the profile generation
captured when its renderer document started; calls queued by an old document are
rejected after an account change. Guest transitions also reload the document.

`local-profiles.test.mjs` exercises legacy profile preservation, A → B → guest → A
switches, real Library text and canvas notes, independent defaults and stored
keys, and rejection of late writes from the closed profile. Desktop CI also
installs and launches the shared app on macOS, Windows and Linux.
