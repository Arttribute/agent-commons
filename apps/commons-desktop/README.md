# Agent Commons Desktop

Agent Commons Desktop has two deliberately separate execution modes:

- **Cloud** loads the production `commons-app`, so ordinary product UI changes
  reach desktop users at the same time as browser users.
- **Private Local** loads a UI bundle built from the shared
  `apps/commons-app/components/desktop` source. Agents, conversations,
  Knowledge Spaces, tasks, workflows, app definitions, and model traffic stay
  on the machine.

Private Local currently supports Ollama's `/api/chat` and `/api/tags`
interfaces on a loopback address. LM Studio or llama.cpp can be supported by a
future OpenAI-compatible adapter. State is encrypted with Electron
`safeStorage` when the operating system makes it available and otherwise is
written with user-only file permissions.

On first launch, a native prompt asks whether to start in **Private Local** or
**Commons Cloud** before any cloud page is loaded. The choice is remembered and
can be changed from the native Workspace menu. Starting in Private Local makes
no Commons Cloud request.

## Development

```bash
pnpm install
pnpm desktop:dev
```

Run Ollama separately and install at least one tool-capable model:

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

The Cloud window defaults to `https://www.agentcommons.io`. Override it for a
staging build with `COMMONS_DESKTOP_CLOUD_URL`. Private renderer traffic is
blocked by CSP; model requests and local tools run in Electron's main process.

## Build and package

```bash
pnpm desktop:build
pnpm desktop:package
```

Packaging creates platform installers under `apps/commons-desktop/release`.
Code signing variables are supplied by the release environment; do not commit
certificates or credentials.

Tagged releases (`desktop-v*`) are built by `.github/workflows/desktop.yml` for
macOS (Apple silicon and Intel), Windows, and Linux. Until publisher enrollment
is complete, releases may be unsigned and must be identified that way on the
download page and in their release notes. When configured, macOS uses
`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`; Windows uses `WIN_CSC_LINK`
and `WIN_CSC_KEY_PASSWORD`.

## Security boundary

- Cloud and private windows use separate session partitions and preload APIs.
- The private renderer has no Node.js access and no direct network access.
- Local model endpoints must resolve to loopback.
- Generated app previews have no preload and can only request their own
  loopback origin.
- File tools resolve symlinks, stay within the selected root, and block common
  credential paths.
- Writes and processes require approval unless the workspace is read-only.

Approved commands still run with the user's operating-system permissions and
are not an OS-level sandbox. They can access the network or other files when
the approved command explicitly does so. This is shown in the approval dialog;
strict process sandboxing is a separate hardening milestone.
