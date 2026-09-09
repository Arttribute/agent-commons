# Agent Commons for VS Code

A focused coding workspace for your Agent Commons agents. Start a task in the
sidebar, work in a native terminal, and keep your editor close to the conversation.

## Install

Download `agent-commons.vsix` from the
[latest VS Code release](https://github.com/Arttribute/agent-commons/releases?q=vscode-v&expanded=true).
In VS Code, run **Extensions: Install from VSIX…**, select the download, and reload
if prompted. You can also install from the command line:

```sh
code --install-extension agent-commons.vsix
```

Requires VS Code 1.95 or newer and **Node.js 22 or newer** on the machine running
the extension. For SSH, WSL, and Dev Containers, install Node on the remote host.
A Commons account and an agent are required; model usage follows your Commons
account's billing. The extension itself is free and MIT licensed.

The extension bundles its CLI runtime. A global npm installation is not required.
Marketplace publication is a separate release step; do not assume a Marketplace
listing exists until it is linked in a release announcement.

## Start building

1. Open a project folder and trust the workspace.
2. Click **Agent Commons** in the Activity Bar (`Cmd+Alt+A` / `Ctrl+Alt+A`).
3. Choose **Sign in**. Complete the browser device-code flow in the account terminal.
4. Choose **Change** to select your agent, or use the account's default agent.
5. Describe your task and select **Start session**. Continue in the Commons terminal.

The terminal streams the response, shows local tool activity, asks before edits
and command execution, and displays token/cost information when the API supplies it.
A root `AGENTS.md` is included as project instructions on each local-tools turn.
Use `@src/file.ts` references to attach additional files.

## Editor and session workflow

- Right-click code and choose **Agent Commons: Explain Selection or File** or
  **Review Selection or File**. These start a session with local read-only permissions.
- Selected text is included directly; with no selection, the current file is included.
  Unsaved editor content is supported. The maximum initial task size is 100 KB.
- **Resume a session** lists your account's sessions and continues with the original
  agent in your selected project. Verify the project matches the session's work.
- Multiple project folders are supported. Editor actions use the file's project;
  new sessions use the active file's project or ask you to choose a folder.
- Use `/help`, `/tools`, `/session`, `/clear`, and `/quit` in the terminal.
  `Ctrl+C` exits the CLI; resume the preserved session later. Closing a terminal
  ends its local process; it does not delete the remote conversation.

## Permissions and data

| Setting | Local behavior |
| --- | --- |
| `ask` (default) | Read project files; ask before edits, commands, and background processes |
| `read-only` | Read project files; deny local edits and commands |
| `off` | Disable local file and command tools |

Use **Agent Commons: Open Settings** to configure `agentCommons.localTools` and
`agentCommons.nodePath`. The Node executable setting is machine-scoped. Read-only
applies to local tools; an agent's remote platform tools follow its Commons permissions.

File tools reject paths outside the project, including symlink escapes, and block
common credential locations such as `.env`, `.ssh`, `.aws`, and `.agc`.
**Approved commands run with your OS account's permissions and are not sandboxed.**
Review the command and working directory before approving. A blank answer denies
an operation; `y` approves once, `n` denies once, `A` allows that operation type for
the session, and `N` denies that type for the session.

Prompts, attached editor content, project instructions, directory listings, and
requested tool results are sent to Agent Commons and the selected model provider.
Sensitive-path filtering is a guardrail, not a comprehensive secret scanner.
Review selected content before submitting it. The extension adds no analytics.

Sign-in uses the CLI's protected `~/.agc/config.json`; credentials are never stored
in workspace settings or sent to the sidebar. The sidebar persists an unfinished
draft in VS Code webview state. Initial prompts are passed using user-only temporary
files, removed when their terminal closes or the extension deactivates. Session
logs (which can contain code and tool output) live in `~/.agc/sessions/`.
Use **Agent Commons: Sign Out** to clear the shared CLI login. This does not delete
remote sessions or local logs.

## Use the terminal outside VS Code

Once the corresponding CLI version is released to npm:

```sh
npm install --global @agent-commons/cli
agc login
agc code "Investigate the failing tests and propose a fix"
agc code --read-only "Explain this repository"
agc code --resume SESSION_ID
```

`agc chat` remains supported. `agc run` is the noninteractive command for scripts.
For development before npm release, run `node packages/agc-cli/dist/bin.js code`
from the monorepo after building the CLI.

## Development and verification

From the monorepo root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @agent-commons/sdk build
pnpm --filter @agent-commons/cli typecheck
pnpm --filter agent-commons typecheck
pnpm --filter agent-commons test
pnpm --filter agent-commons build
python3 packages/commons-vscode/test/terminal-smoke.py
pnpm --filter agent-commons package
```

The Python PTY test requires macOS/Linux and exercises streaming, local-tool
approval/denial, read-only mode, initial prompts, instructions, and resume against
a local API fixture without using a real account. Unit tests run on all platforms.
Open `packages/commons-vscode` in VS Code and press **F5** to launch the extension
host. `test/extension-host.cjs` also runs with VS Code's `--extensionTestsPath` flag.
A live account/model smoke test is still recommended before announcing a release.

## Publishing

The `VS Code Extension` GitHub workflow builds and tests pull requests and main.
A `vscode-vX.Y.Z` tag matching this package's version creates a public GitHub release
with an installable VSIX. The release does not need Marketplace credentials.

For Marketplace publication, create/verify a publisher account, set `publisher` in
`package.json` to its exact ID, and configure the repository secret **VSCE_PAT** with
permission to publish for that account. Run the workflow manually from main with
`publish_marketplace` enabled. The workflow packages and tests before publishing.
See Microsoft's [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
Do not commit publishing credentials. Version this private workspace package manually;
it is distributed through VSIX/Marketplace, while the public CLI uses Changesets/npm.

## Troubleshooting

- **Node not found:** install Node 22+ on the extension host, reload VS Code, or set
  an absolute **Agent Commons: Node Path** in your user settings.
- **Cannot load agents/sessions:** sign in again and check account/network access.
- **Restricted Mode:** trust a project you own before starting local tools.
- **No agents:** create an agent at [Agent Commons](https://www.agentcommons.io), then select it.
- **Web editor:** browser-only VS Code is unsupported; use desktop or a remote workspace host.

[Report an issue](https://github.com/Arttribute/agent-commons/issues) with your OS,
VS Code version, Node version, and reproduction steps. Remove credentials and
private source code from logs before sharing them.
