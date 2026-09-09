import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { randomBytes } from 'node:crypto';
import { insideRoot, nodeEnvironment, sessionArgs, validMode, type ToolMode } from './launch';

const exec = promisify(execFile);
interface Agent { agentId: string; name: string }
interface Session { sessionId: string; agentId?: string; title?: string; createdAt?: string }

export function activate(context: vscode.ExtensionContext): void {
  const terminalDirs = new Map<vscode.Terminal, string | undefined>();
  const cli = context.asAbsolutePath('dist/cli.cjs');
  let view: vscode.WebviewView | undefined;
  let launching = false;
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.text = '$(terminal) Commons';
  status.tooltip = 'Open Agent Commons coding workspace';
  status.command = 'agentCommons.open';
  status.show();

  const nodePath = () => vscode.workspace.getConfiguration('agentCommons').get<string>('nodePath', 'node');
  const mode = () => validMode(vscode.workspace.getConfiguration('agentCommons').get('localTools'));
  const selectedAgent = () => context.workspaceState.get<Agent>('agent');
  function guard(): void {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before running Agent Commons.');
  }
  async function checkNode(): Promise<void> {
    try {
      const { stdout } = await exec(nodePath(), ['--version'], { timeout: 5_000, env: nodeEnvironment(process.env) });
      if (Number(stdout.trim().replace(/^v/, '').split('.')[0]) < 22) throw new Error('Unsupported Node version');
    } catch {
      throw new Error('Node.js 22 or newer is required on this machine (or remote host). Install Node and reload VS Code, or set Agent Commons: Node Path.');
    }
  }
  async function query<T>(args: string[]): Promise<T> {
    guard();
    await checkNode();
    try {
      const { stdout } = await exec(nodePath(), [cli, ...args, '--json'], {
        timeout: 30_000, maxBuffer: 4 * 1024 * 1024, env: { ...nodeEnvironment(process.env), NO_COLOR: '1' },
      });
      const data = JSON.parse(stdout);
      return (data?.data ?? data) as T;
    } catch {
      throw new Error('Could not load your Commons account. Sign in using Agent Commons: Sign In, then try again. Check your network and account access if this continues.');
    }
  }
  async function rootFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) throw new Error('Open a project folder to start a coding session.');
    if (folders.length === 1) return folders[0];
    const current = vscode.window.activeTextEditor?.document.uri;
    const active = current && vscode.workspace.getWorkspaceFolder(current);
    return active || await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Choose the project for this session' });
  }
  function refresh(): void {
    void view?.webview.postMessage({ type: 'state', agent: selectedAgent()?.name ?? 'Default agent', mode: mode(),
      folder: vscode.workspace.workspaceFolders?.map(f => f.name).join(', ') ?? 'Open a project folder',
      sessions: terminalDirs.size, trusted: vscode.workspace.isTrusted });
  }
  async function openTerminal(args: string[], cwd?: string, temporaryDir?: string): Promise<void> {
    guard();
    await checkNode();
    const terminal = vscode.window.createTerminal({
      name: args[0] === 'code' ? 'Commons · Coding' : 'Commons · Account',
      shellPath: nodePath(), shellArgs: [cli, ...args], cwd,
      // Null explicitly removes inherited variables in a VS Code terminal.
      env: { NODE_OPTIONS: null, NODE_PATH: null, ELECTRON_RUN_AS_NODE: null },
      iconPath: new vscode.ThemeIcon('terminal'), isTransient: true,
    });
    terminalDirs.set(terminal, temporaryDir);
    terminal.show();
    refresh();
  }
  async function start(prompt?: string, session?: Session, overrideMode?: ToolMode, folderOverride?: vscode.WorkspaceFolder): Promise<void> {
    guard();
    if (launching) return;
    launching = true;
    let temporaryDir: string | undefined;
    try {
      const folder = folderOverride ?? await rootFolder();
      if (!folder) return;
      if (prompt && Buffer.byteLength(prompt, 'utf8') > 100_000) throw new Error('This prompt is too large. Select a smaller excerpt (maximum 100 KB).');
      let promptFile: string | undefined;
      if (prompt?.trim()) {
        temporaryDir = await mkdtemp(join(tmpdir(), 'agent-commons-'));
        promptFile = join(temporaryDir, 'prompt.txt');
        await writeFile(promptFile, prompt, { mode: 0o600 });
      }
      await openTerminal(sessionArgs({
        agentId: session?.agentId ?? selectedAgent()?.agentId, sessionId: session?.sessionId,
        promptFile, mode: overrideMode ?? mode(),
      }), folder.uri.fsPath, temporaryDir);
      void view?.webview.postMessage({ type: 'started' });
    } catch (error) {
      if (temporaryDir) await rm(temporaryDir, { recursive: true, force: true });
      throw error;
    } finally { launching = false; }
  }
  async function selectAgent(): Promise<void> {
    const agents = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Loading Commons agents' }, () => query<Agent[]>(['agents', 'list']));
    if (!Array.isArray(agents) || !agents.length) throw new Error('No agents found. Create an agent at agentcommons.io, then refresh.');
    const picked = await vscode.window.showQuickPick(agents.map(agent => ({ label: agent.name, description: agent.agentId, agent })), { placeHolder: 'Choose your coding agent' });
    if (picked) await context.workspaceState.update('agent', picked.agent);
    refresh();
  }
  async function resume(): Promise<void> {
    const sessions = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Loading Commons sessions' }, () => query<Session[]>(['sessions', 'list']));
    if (!Array.isArray(sessions) || !sessions.length) { void vscode.window.showInformationMessage('No Commons sessions yet. Start a new coding session.'); return; }
    const picked = await vscode.window.showQuickPick(sessions.map(session => ({ label: session.title || 'Untitled session', description: session.sessionId, detail: session.createdAt, session })), { placeHolder: 'Resume a Commons session in this project' });
    if (picked) await start(undefined, picked.session);
  }
  async function editorTask(action: 'explain' | 'review'): Promise<void> {
    guard();
    const editor = vscode.window.activeTextEditor;
    if (!editor) throw new Error('Open a file or select code first.');
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!folder || editor.document.uri.scheme !== 'file') throw new Error('Choose a file in an open project folder.');
    const file = await realpath(editor.document.uri.fsPath);
    const root = await realpath(folder.uri.fsPath);
    if (!insideRoot(root, file)) throw new Error('This file resolves outside the project folder.');
    if (/(^|[\\/])(\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|\.agc|id_rsa|id_ed25519)([\\/]|$)/i.test(relative(root, file))) throw new Error('Sensitive files cannot be attached as editor context.');
    const selection = editor.selection;
    const content = editor.document.getText(selection.isEmpty ? undefined : selection);
    const location = `${relative(root, file)}${selection.isEmpty ? '' : `:${selection.start.line + 1}-${selection.end.line + 1}`}`;
    const task = action === 'review'
      ? 'Review this code for correctness, regressions, and missing tests. Report concrete findings with file and line references. Do not modify files.'
      : 'Explain this code, its purpose, and the important implementation details. Do not modify files.';
    await start(`${task}\n\nEditor context (${editor.document.isDirty ? 'unsaved buffer' : 'file'}): ${location}\n\n${content}`, undefined, 'read-only', folder);
  }
  const actions: Record<string, () => unknown> = {
    open: async () => { await vscode.commands.executeCommand('workbench.view.extension.agentCommons'); },
    start: () => start(), resume, selectAgent,
    login: () => openTerminal(['login']), logout: () => openTerminal(['logout']),
    explain: () => editorTask('explain'), review: () => editorTask('review'), refresh,
    settings: () => vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`),
  };
  async function run(action: () => unknown): Promise<void> {
    try { await action(); } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent Commons could not complete this action.';
      void vscode.window.showErrorMessage(message);
      void view?.webview.postMessage({ type: 'error', message });
    }
  }
  for (const [name, action] of Object.entries(actions)) context.subscriptions.push(vscode.commands.registerCommand(`agentCommons.${name}`, () => run(action)));
  context.subscriptions.push(status, vscode.window.registerWebviewViewProvider('agentCommons.workspace', {
    resolveWebviewView(webviewView) {
      view = webviewView;
      view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] };
      const nonce = randomBytes(18).toString('base64');
      const resource = (file: string) => view!.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', file));
      view.webview.html = html(nonce, view.webview.cspSource, resource('sidebar.css').toString(), resource('sidebar.js').toString());
      view.webview.onDidReceiveMessage(message => {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'ready') refresh();
        if (message.type === 'start' && typeof message.prompt === 'string') void run(() => start(message.prompt));
        if (message.type === 'action' && typeof message.action === 'string' && Object.hasOwn(actions, message.action)) void run(actions[message.action]);
      }, undefined, context.subscriptions);
      view.onDidDispose(() => { view = undefined; }, undefined, context.subscriptions);
    },
  }), vscode.window.onDidCloseTerminal(terminal => {
    const dir = terminalDirs.get(terminal);
    terminalDirs.delete(terminal);
    if (dir) void rm(dir, { recursive: true, force: true });
    refresh();
  }), vscode.workspace.onDidChangeConfiguration(refresh), vscode.workspace.onDidChangeWorkspaceFolders(refresh), {
    dispose() {
      for (const [terminal, dir] of terminalDirs) {
        terminal.dispose();
        if (dir) void rm(dir, { recursive: true, force: true });
      }
      terminalDirs.clear();
    },
  });
}

function html(nonce: string, source: string, css: string, js: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${source}; script-src 'nonce-${nonce}';">
  <link href="${css}" rel="stylesheet"><title>Agent Commons</title></head><body>
  <header><div class="brand-mark" aria-hidden="true">◇</div><div><span class="eyebrow">AGENT COMMONS</span><h1>Let's build.</h1></div></header>
  <p class="intro">A focused space to work with your agents. Describe a task and continue in the terminal.</p>
  <section class="workspace" aria-label="Workspace"><span class="eyebrow">WORKSPACE</span><p id="folder">Loading…</p><div class="row"><span id="agent">Default agent</span><button class="text" data-action="selectAgent">Change</button></div></section>
  <form id="composer"><label for="prompt">What are we working on?</label><textarea id="prompt" rows="6" maxlength="50000" placeholder="Build a feature, investigate a bug, or explore this project…"></textarea><div class="composer-footer"><span id="mode">Ask before changes</span><button class="primary" type="submit">Start session <span aria-hidden="true">↗</span></button></div></form>
  <p id="feedback" role="status" aria-live="polite"></p>
  <section class="actions" aria-label="Quick actions"><button data-action="resume"><span>Resume a session</span><span aria-hidden="true">↗</span></button><button data-action="review"><span>Review current code</span><span aria-hidden="true">↗</span></button><button data-action="explain"><span>Explain current code</span><span aria-hidden="true">↗</span></button></section>
  <section class="note"><span class="eyebrow">YOUR PROJECT. YOUR CONTROL.</span><p>Local reads stay within the selected project. Review edits and commands in the terminal before approving them. Context you send is processed by Agent Commons and your agent’s model provider.</p></section>
  <footer><button class="text" data-action="login">Sign in</button><button class="text" data-action="settings">Settings</button><span id="sessions"></span></footer>
  <script nonce="${nonce}" src="${js}"></script></body></html>`;
}
