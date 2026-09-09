import * as vscode from 'vscode';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { basename, relative, join, resolve } from 'node:path';
import { Runtime } from './bridge';
import { insideRoot, validMode, type ToolMode } from './launch';
import type { Attachment, ChatSession, Message, Change } from './chat';
import { html } from './view';
interface Agent {
  agentId: string;
  name: string;
}
interface Account {
  authenticated: boolean;
  userId?: string;
  name?: string;
  email?: string;
  workspaceId?: string;
}
export function activate(context: vscode.ExtensionContext): void {
  let view: vscode.WebviewView | undefined;
  let account: Account | undefined,
    sessions: ChatSession[] = [],
    current: ChatSession | undefined;
  let busy = false,
    signingIn = false,
    loading = false,
    error = '',
    device: { code: string; url: string } | undefined;
  let attachments: Attachment[] = [],
    approval: any,
    activeReply: Message | undefined;
  let agent = context.workspaceState.get<Agent>('agent');
  let sessionMode: ToolMode | undefined;
  let lastEditor = vscode.window.activeTextEditor;
  const snapshots = new Map<string, string>();
  const runtime = new Runtime(
    () => vscode.workspace.getConfiguration('agentCommons').get('nodePath', 'node'),
    context.asAbsolutePath('dist/runtime.cjs'),
    onEvent
  );
  const mode = () =>
    sessionMode ?? validMode(vscode.workspace.getConfiguration('agentCommons').get('localTools'));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.text = '$(comment-discussion) Commons';
  status.command = 'agentCommons.open';
  status.show();
  function guard() {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace to use Commons.');
  }
  function idle() {
    if (busy || loading || signingIn)
      throw new Error('Wait for the current action to finish, or stop it first.');
  }
  function state() {
    void view?.webview.postMessage({
      type: 'state',
      account,
      sessions: sessions.map(({ sessionId, agentId, title, createdAt, root }) => ({
        sessionId,
        agentId,
        title,
        createdAt,
        root,
      })),
      current: current && {
        ...current,
        messages: current.messages?.map((message) => ({
          ...message,
          changes: message.changes?.map(({ before, after, ...change }) => ({
            ...change,
            preview: preview(before, after),
          })),
        })),
      },
      busy,
      signingIn,
      loading,
      error,
      device,
      approval,
      agent:
        current?.agentId && current.agentId !== agent?.agentId
          ? 'Session agent'
          : agent?.name ?? 'Default agent',
      mode: mode(),
      folder: current?.root
        ? basename(current.root)
        : vscode.workspace.workspaceFolders?.map((f) => f.name).join(', ') ??
          'Open a project folder',
      attachments: attachments.map(({ id, name }) => ({ id, name })),
    });
    status.text = busy ? '$(loading~spin) Commons' : '$(comment-discussion) Commons';
  }
  function preview(before: string, after: string) {
    if (before === after) return 'No content change';
    const a = before.split('\n'),
      b = after.split('\n');
    let start = 0,
      ae = a.length,
      be = b.length;
    while (start < ae && start < be && a[start] === b[start]) start++;
    while (ae > start && be > start && a[ae - 1] === b[be - 1]) {
      ae--;
      be--;
    }
    return [...a.slice(start, ae).map((l) => `− ${l}`), ...b.slice(start, be).map((l) => `+ ${l}`)]
      .join('\n')
      .slice(0, 12000);
  }
  let saving: Promise<unknown> = Promise.resolve();
  function storagePath(id: string) {
    if (!context.storageUri || !account?.userId) return undefined;
    const key = createHash('sha256').update(`${account.userId}:${id}`).digest('hex');
    return join(context.storageUri.fsPath, `${key}.json`);
  }
  async function persist() {
    if (!current) return;
    const path = storagePath(current.sessionId);
    if (!path) return;
    const data = JSON.stringify(current);
    if (current.root) {
      const key = `roots:${account?.userId}`;
      await context.workspaceState.update(key, {
        ...context.workspaceState.get(key, {}),
        [current.sessionId]: current.root,
      });
    }
    saving = saving
      .catch(() => {})
      .then(async () => {
        await mkdir(context.storageUri!.fsPath, { recursive: true, mode: 0o700 });
        await writeFile(path, data, { mode: 0o600 });
      });
    await saving;
  }
  async function refresh() {
    guard();
    if (busy) {
      state();
      return;
    }
    const nextAccount: Account = await runtime.request('account');
    if (account?.userId !== nextAccount.userId) {
      current = undefined;
      attachments = [];
      sessions = [];
    }
    account = nextAccount;
    if (account?.authenticated) {
      const roots = context.workspaceState.get<Record<string, string>>(
        `roots:${account.userId}`,
        {}
      );
      sessions = (await runtime.request('sessions')).map((session: ChatSession) => ({
        ...session,
        root: roots[session.sessionId],
      }));
    } else {
      sessions = [];
      current = undefined;
      attachments = [];
    }
    state();
  }
  async function folder(): Promise<string> {
    if (current?.root) return current.root;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) throw new Error('Open a project folder to start a chat.');
    const active = lastEditor && vscode.workspace.getWorkspaceFolder(lastEditor.document.uri);
    const selected =
      active ?? (folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick());
    if (!selected) throw new Error('Choose a project folder to continue.');
    return selected.uri.fsPath;
  }
  async function open() {
    await vscode.commands.executeCommand('workbench.view.extension.agentCommons');
    view?.show(false);
  }
  async function newChat() {
    idle();
    await persist();
    runtime.dispose();
    current = undefined;
    attachments = [];
    sessionMode = undefined;
    error = '';
    await open();
    state();
    void view?.webview.postMessage({ type: 'draft', text: '' });
  }
  async function send(prompt: string) {
    guard();
    idle();
    if (!prompt.trim() && !attachments.length) return;
    if (Buffer.byteLength(prompt) > 100_000)
      throw new Error('Keep your message under 100 KB. Attach larger files using +.');
    busy = true;
    error = '';
    state();
    try {
      const root = await folder();
      if (!current)
        current = {
          sessionId: `draft-${randomUUID()}`,
          agentId: agent?.agentId ?? '',
          title: prompt.slice(0, 80) || 'File discussion',
          root,
          messages: [],
        };
      const files = [...attachments];
      attachments = [];
      current.messages ??= [];
      current.messages.push({
        id: randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
        attachments: files.map((f) => f.name),
      });
      activeReply = {
        id: randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        activities: [],
        changes: [],
      };
      current.messages.push(activeReply);
      state();
      void view?.webview.postMessage({ type: 'draft', text: '' });
      await runtime.request('send', {
        prompt,
        attachments: files,
        agentId: current.agentId || agent?.agentId,
        sessionId: current.sessionId.startsWith('draft-') ? undefined : current.sessionId,
        root,
        mode: mode(),
      });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not send message.';
      for (const activity of activeReply?.activities ?? [])
        if (activity.status === 'running') {
          activity.status = 'error';
          activity.detail += `\n${error}`;
        }
    } finally {
      busy = false;
      approval = undefined;
      activeReply = undefined;
      await persist();
      state();
    }
  }
  function onEvent(event: any) {
    if (event.type === 'device') {
      device = { code: event.code, url: event.url };
      void vscode.env.openExternal(vscode.Uri.parse(event.url));
    }
    if (event.type === 'session' && current) {
      Object.assign(current, {
        sessionId: event.session.sessionId,
        agentId: event.session.agentId,
        title: event.session.title ?? current.title,
        createdAt: event.session.createdAt ?? new Date().toISOString(),
      });
      sessions = [current, ...sessions.filter((s) => s.sessionId !== current!.sessionId)];
    }
    if (event.type === 'token' && activeReply) activeReply.content += event.content;
    if (event.type === 'activity' && activeReply) {
      const activities = activeReply.activities!;
      const index = activities.findIndex((a) => a.id === event.activity.id);
      if (index < 0) activities.push(event.activity);
      else activities[index] = event.activity;
    }
    if (event.type === 'changes' && activeReply) activeReply.changes = event.changes;
    if (event.type === 'approval') {
      approval = event;
      // Do not approve overwriting a dirty editor buffer: ask the agent to re-read after the user saves.
      if (
        event.tool === 'write_file' &&
        vscode.workspace.textDocuments.some(
          (d) => d.isDirty && event.message.includes(d.uri.fsPath)
        )
      ) {
        runtime.approve(event.id, false);
        approval = undefined;
        error =
          'An edit was declined because the file has unsaved changes. Save it before retrying.';
      }
    }
    scheduleState();
  }
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleState() {
    if (!renderTimer)
      renderTimer = setTimeout(() => {
        renderTimer = undefined;
        state();
      }, 50);
  }
  async function resume(id?: string) {
    guard();
    idle();
    if (!id) {
      await open();
      await refresh();
      void view?.webview.postMessage({ type: 'panel', panel: 'history' });
      return;
    }
    if (!sessions.some((s) => s.sessionId === id))
      throw new Error('Refresh history and select a session.');
    loading = true;
    error = '';
    state();
    try {
      await persist();
      runtime.dispose();
      let saved: ChatSession | undefined;
      const path = storagePath(id);
      if (path) {
        try {
          saved = JSON.parse(await readFile(path, 'utf8'));
        } catch {}
      }
      const remote = await runtime.request('history', { id });
      if (saved?.messages?.length) {
        remote.messages =
          remote.messages.length > saved.messages.length
            ? remote.messages.map((message: Message) => {
                const local = saved!.messages!.find(
                  (m) => m.role === message.role && m.content === message.content
                );
                return local ?? message;
              })
            : saved.messages;
      }
      const root = saved?.root;
      if (root && !vscode.workspace.workspaceFolders?.some((f) => insideRoot(f.uri.fsPath, root)))
        throw new Error('Open this session’s original project folder to continue.');
      current = { ...remote, root };
      attachments = [];
      sessionMode = undefined;
      void view?.webview.postMessage({ type: 'panel', panel: 'chat' });
    } finally {
      loading = false;
      state();
    }
  }
  async function selectAgent() {
    idle();
    if (current) throw new Error('Start a new chat to choose another agent.');
    const agents: Agent[] = await runtime.request('agents');
    const picked = await vscode.window.showQuickPick(
      agents.map((a) => ({ label: a.name, description: a.agentId, agent: a })),
      { placeHolder: 'Choose an agent' }
    );
    if (picked) {
      agent = picked.agent;
      await context.workspaceState.update('agent', agent);
      state();
    }
  }
  async function login() {
    guard();
    idle();
    signingIn = true;
    error = '';
    state();
    try {
      account = await runtime.request('login');
      current = undefined;
      sessions = [];
      await refresh();
    } finally {
      signingIn = false;
      device = undefined;
      state();
    }
  }
  async function logout() {
    idle();
    await persist();
    await runtime.request('logout');
    runtime.dispose();
    account = { authenticated: false };
    sessions = [];
    current = undefined;
    attachments = [];
    agent = undefined;
    await context.workspaceState.update('agent', undefined);
    state();
  }
  async function attachEditor(action?: 'explain' | 'review') {
    guard();
    idle();
    const editor = lastEditor;
    if (!editor || editor.document.uri.scheme !== 'file')
      throw new Error('Open a project file or select code first.');
    const project = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!project) throw new Error('Choose a file in an open project.');
    const path = await checkedFile(editor.document.uri.fsPath);
    const root = await realpath(project.uri.fsPath);
    if (!insideRoot(root, path)) throw new Error('This file resolves outside the project.');
    const text = editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
    if (Buffer.byteLength(text) > 100_000)
      throw new Error('Select a smaller excerpt (maximum 100 KB).');
    if (action) await newChat();
    if (attachments.length >= 10) throw new Error('Attach up to 10 files per message.');
    const name = `${relative(root, path)}${
      editor.selection.isEmpty
        ? ''
        : `:${editor.selection.start.line + 1}-${editor.selection.end.line + 1}`
    }${editor.document.isDirty ? ' (unsaved buffer)' : ''}`;
    attachments.push({ id: randomUUID(), name, text });
    if (action) {
      current = {
        sessionId: `draft-${randomUUID()}`,
        agentId: agent?.agentId ?? '',
        root,
        messages: [],
      };
      sessionMode = 'read-only';
      await send(
        action === 'review'
          ? 'Review this code for correctness, regressions, and missing tests. Give concrete file and line references. Do not modify files.'
          : 'Explain this code, its purpose, and the important implementation details. Do not modify files.'
      );
    }
    state();
  }
  async function checkedFile(path: string) {
    const resolved = await realpath(path);
    const sensitive =
      /(^|[\\/])(\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|\.agc|id_rsa|id_ed25519)([\\/]|$)/i;
    if (sensitive.test(path) || sensitive.test(resolved))
      throw new Error('Sensitive credential files cannot be attached.');
    const info = await stat(resolved);
    if (!info.isFile() || info.size > 10_000_000)
      throw new Error('Choose a file smaller than 10 MB.');
    return resolved;
  }
  async function attach() {
    guard();
    idle();
    const files = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFolders: false,
      openLabel: 'Attach to chat',
    });
    if (!files) return;
    if (files.length + attachments.length > 10)
      throw new Error('Attach up to 10 files per message.');
    const selected: Attachment[] = [];
    for (const file of files)
      selected.push({
        id: randomUUID(),
        name: basename(file.fsPath),
        path: await checkedFile(file.fsPath),
      });
    attachments.push(...selected);
    state();
  }
  async function diff(id: string) {
    const change = current?.messages?.flatMap((m) => m.changes ?? []).find((c) => c.id === id);
    if (!change) throw new Error('This change is no longer available.');
    const uri = (side: string) =>
      vscode.Uri.from({ scheme: 'commons-diff', path: `/${id}/${side}/${basename(change.path)}` });
    snapshots.set(uri('before').toString(), change.before);
    snapshots.set(uri('after').toString(), change.after);
    await vscode.commands.executeCommand(
      'vscode.diff',
      uri('before'),
      uri('after'),
      `${basename(change.path)} · Commons changes`,
      { preview: true }
    );
  }
  const actions: Record<string, () => unknown> = {
    open,
    start: newChat,
    resume: () => resume(),
    selectAgent,
    login,
    logout,
    attach,
    attachEditor: () => attachEditor(),
    explain: () => attachEditor('explain'),
    review: () => attachEditor('review'),
    refresh,
    stop: () => {
      runtime.dispose();
      approval = undefined;
      device = undefined;
    },
    settings: () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${context.extension.id}`
      ),
    account: () => {
      void view?.webview.postMessage({ type: 'panel', panel: 'account' });
    },
    manageAccount: () =>
      vscode.env.openExternal(vscode.Uri.parse('https://www.agentcommons.io/settings')),
    reopenLogin: () => device && vscode.env.openExternal(vscode.Uri.parse(device.url)),
  };
  async function run(action: () => unknown) {
    try {
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      state();
    }
  }
  for (const [name, action] of Object.entries(actions))
    context.subscriptions.push(
      vscode.commands.registerCommand(`agentCommons.${name}`, () => run(action))
    );
  const saveTimer = setInterval(() => {
    if (busy) void persist().catch(() => {});
  }, 5000);
  context.subscriptions.push(
    {
      dispose() {
        clearInterval(saveTimer);
        clearTimeout(renderTimer);
        void persist().catch(() => {});
      },
    },
    status,
    runtime,
    vscode.workspace.registerTextDocumentContentProvider('commons-diff', {
      provideTextDocumentContent: (uri) => snapshots.get(uri.toString()) ?? '',
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.uri.scheme === 'file') lastEditor = editor;
    }),
    vscode.workspace.onDidChangeConfiguration(() => state()),
    vscode.window.registerWebviewViewProvider(
      'agentCommons.workspace',
      {
        resolveWebviewView(webviewView) {
          view = webviewView;
          view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
          };
          const resource = (name: string) =>
            view!.webview
              .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', name))
              .toString();
          view.webview.html = html(
            randomBytes(18).toString('base64'),
            view.webview.cspSource,
            resource('sidebar.css'),
            resource('sidebar.js')
          );
          view.webview.onDidReceiveMessage(
            (message) => {
              if (!message || typeof message !== 'object') return;
              void run(async () => {
                if (message.type === 'ready') {
                  state();
                  if (!account) await refresh();
                } else if (message.type === 'send' && typeof message.prompt === 'string')
                  await send(message.prompt);
                else if (message.type === 'action' && Object.hasOwn(actions, message.action))
                  await actions[message.action]();
                else if (message.type === 'resume' && typeof message.id === 'string')
                  await resume(message.id);
                else if (message.type === 'diff' && typeof message.id === 'string')
                  await diff(message.id);
                else if (message.type === 'openFile' && typeof message.path === 'string') {
                  guard();
                  const match = /^(.*?)(?::(\d+))?$/.exec(message.path)!;
                  const root = await realpath(await folder());
                  const path = await checkedFile(resolve(root, match[1]));
                  if (!insideRoot(root, path))
                    throw new Error('Choose a file inside this project.');
                  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
                  const line = Math.max(0, Math.min(doc.lineCount - 1, Number(match[2] ?? 1) - 1));
                  await vscode.window.showTextDocument(doc, {
                    selection: new vscode.Range(line, 0, line, 0),
                  });
                } else if (message.type === 'removeAttachment') {
                  idle();
                  attachments = attachments.filter((f) => f.id !== message.id);
                  state();
                } else if (message.type === 'approve' && approval?.id === message.id) {
                  runtime.approve(message.id, message.allow === true);
                  approval = undefined;
                  state();
                } else if (
                  message.type === 'mode' &&
                  ['ask', 'read-only', 'off'].includes(message.mode)
                ) {
                  idle();
                  sessionMode = message.mode;
                  state();
                } else if (
                  message.type === 'rename' &&
                  sessions.some((s) => s.sessionId === message.id)
                ) {
                  idle();
                  const title = await vscode.window.showInputBox({
                    prompt: 'Name this chat',
                    value: sessions.find((s) => s.sessionId === message.id)?.title,
                    validateInput: (value) =>
                      value.trim() && value.length <= 100 ? undefined : 'Enter 1–100 characters.',
                  });
                  if (title) {
                    await runtime.request('rename', { id: message.id, title: title.trim() });
                    if (current && current.sessionId === message.id) {
                      current.title = title.trim();
                      await persist();
                    }
                    await refresh();
                  }
                } else if (message.type === 'drop' && Array.isArray(message.files)) {
                  guard();
                  idle();
                  if (attachments.length + message.files.length > 10)
                    throw new Error('Attach up to 10 files per message.');
                  const selected: Attachment[] = [];
                  for (const file of message.files) {
                    if (
                      typeof file.name !== 'string' ||
                      typeof file.data !== 'string' ||
                      file.data.length > 13_333_336 ||
                      file.name.length > 255
                    )
                      throw new Error('Choose files smaller than 10 MB.');
                    if (/^(\.env(?:\..*)?|id_rsa|id_ed25519)$/i.test(file.name))
                      throw new Error('Sensitive credential files cannot be attached.');
                    selected.push({
                      id: randomUUID(),
                      name: basename(file.name),
                      data: file.data,
                      mime: typeof file.mime === 'string' ? file.mime : undefined,
                    });
                  }
                  attachments.push(...selected);
                  state();
                }
              });
            },
            undefined,
            context.subscriptions
          );
          view.onDidDispose(
            () => {
              view = undefined;
            },
            undefined,
            context.subscriptions
          );
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}
