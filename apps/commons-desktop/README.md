# Agent Commons Desktop

Desktop packages the actual `apps/commons-app` Next.js build. Cloud and Private
Local use one renderer, one routing tree, and the same interface. The mode
toggle changes the data provider and agent runtime without opening another app.

- **Cloud** uses the Commons account and online services. After sign-in, agents
  can use computer tools in a project folder chosen on this machine. Each
  write or command asks for approval.
- **Private Local** stores agents, conversations, Knowledge Spaces, Library
  files, artifacts, skills, apps, tasks, and workflows under the desktop user
  data directory's `private-local/workspace`. Agents use a local Ollama model.
  The shared UI reads Local data through Electron's mode-gated bridge.

The first launch starts at Commons sign-in. Use the Cloud/Local toggle to enter
Private Local. The last mode is remembered. Starting in Private Local makes no
Commons Cloud request. Account identity and shared display preferences can be
shown in either mode; Local workspace records are not synced to Cloud.

Private Local supports Ollama's `/api/chat` and `/api/tags` interfaces on a
loopback address. State is encrypted with Electron `safeStorage` when the
operating system provides it and otherwise uses user-only file permissions.

## Development

```bash
pnpm install
pnpm desktop:dev
```

Run Ollama separately and install a tool-capable model, for example:

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

## Build and package

```bash
pnpm desktop:build
pnpm desktop:package
```

The Commons app bundle and installers are written to
`apps/commons-desktop/commons-app-dist` and `apps/commons-desktop/release`.
Tagged releases (`desktop-v*`) are built by `.github/workflows/desktop.yml` for
macOS, Windows, and Linux. Until publisher enrollment is complete, releases
may be unsigned and must be labeled that way on the download page and in the
release notes. Signing uses `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, and
`WIN_CSC_KEY_PASSWORD` when configured.

## Security boundary

- The shared renderer has no Node.js access. Electron grants Cloud and Local
  bridge calls only in their matching mode.
- Private Local renderer requests can reach only the bundled app and approved
  loopback app previews. The local model endpoint must resolve to loopback.
- File tools resolve symlinks, stay within the selected root, and block common
  credential paths. Cloud cannot select a folder overlapping `private-local`.
- Writes and commands require approval. Approved commands run with the user's
  operating system permissions and can reach files outside the chosen folder
  or the network. Cloud command output may be sent to the online agent. The
  Cloud approval dialog explains this before a command runs.

The Cloud command runner is not an operating system sandbox. Do not describe
Private Local files as inaccessible to approved Cloud commands until process
isolation is implemented on each supported platform.
