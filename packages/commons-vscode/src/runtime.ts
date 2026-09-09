/** Background Node runtime. Only structured IPC crosses into the extension host. */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, extname, join } from 'node:path';
import {
  loadConfig,
  ensureAccessToken,
  makeClient,
  clearConfig,
  saveConfig,
  DEFAULT_IDENTITY_URL,
  DEFAULT_IDENTITY_CLIENT_ID,
} from '../../agc-cli/src/config';
import {
  buildLocalToolsManifest,
  buildDirSnapshot,
  readFileForContext,
  runLocalTool,
  safePath,
  stopLocalProcesses,
  extractToolCall,
  type LocalToolsConfig,
} from '../../agc-cli/src/local-tools';
import { changeCounts, textContent, transcript, type Attachment, type Change } from './chat';
const exec = promisify(execFile);
const unwrap = (v: any) => v?.data ?? v;
const emit = (event: any) => {
  if (process.connected) process.send?.({ event });
};
const approvals = new Map<string, (allow: boolean) => void>();
let running = false;
const commands = new AbortController();
async function account() {
  const cfg = await ensureAccessToken();
  return {
    authenticated: Boolean(cfg.sessionToken || cfg.accessToken || cfg.apiKey),
    userId: cfg.userId ?? cfg.initiator,
    name: cfg.userName,
    email: cfg.userEmail,
    workspaceId: cfg.workspaceId,
  };
}
async function login() {
  const cfg = loadConfig(),
    origin = (cfg.identityUrl ?? DEFAULT_IDENTITY_URL).replace(/\/$/, ''),
    clientId = cfg.identityClientId ?? DEFAULT_IDENTITY_CLIENT_ID;
  const response = await fetch(`${origin}/api/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      scope:
        'openid profile email offline_access activity:read agents:create agents:read agents:write agents:run compute:read compute:write usage:read',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const device = (await response.json()) as any;
  if (!response.ok || !device.device_code || !device.user_code)
    throw new Error(device.error_description ?? 'Could not start sign-in. Please try again.');
  const url =
    device.verification_uri_complete ??
    `${device.verification_uri ?? `${origin}/device`}?user_code=${encodeURIComponent(
      device.user_code
    )}`;
  if (new URL(url).origin !== new URL(origin).origin)
    throw new Error('Unexpected sign-in destination. Check your identity configuration.');
  emit({ type: 'device', code: device.user_code, url });
  let interval = Math.max(device.interval ?? 5, 1) * 1000;
  const deadline = Date.now() + (device.expires_in ?? 600) * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const result = await fetch(`${origin}/api/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code,
        client_id: clientId,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const token = (await result.json()) as any;
    if (result.ok && token.access_token) {
      clearConfig();
      saveConfig({ sessionToken: token.access_token });
      return account();
    }
    if (token.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (token.error !== 'authorization_pending')
      throw new Error(token.error_description ?? token.error ?? 'Sign-in failed.');
  }
  throw new Error('Sign-in expired. Try again for a new code.');
}
async function send(input: any) {
  if (running) throw new Error('A response is already running.');
  running = true;
  try {
    const cfg = await ensureAccessToken(),
      client = makeClient();
    const initiator = cfg.userId ?? cfg.initiator;
    if (!initiator) throw new Error('Sign in to start chatting.');
    let agentId = input.agentId ?? cfg.defaultAgentId;
    let session = input.sessionId ? unwrap(await client.sessions.get(input.sessionId)) : undefined;
    if (session) agentId = session.agentId;
    if (!session) {
      const agents = unwrap(await client.agents.list(initiator));
      if (input.agentId && !agents.some((a: any) => a.agentId === input.agentId)) {
        throw new Error(
          'This agent is not available in your account. Start a new chat and choose another agent.'
        );
      }
      agentId =
        input.agentId ??
        agents.find((a: any) => a.agentId === cfg.defaultAgentId)?.agentId ??
        agents.find((a: any) => a.isDefault)?.agentId ??
        agents[0]?.agentId;
    }
    if (!agentId) throw new Error('Create an agent in Commons, then select it here.');
    if (!session)
      session = unwrap(
        await client.sessions.create({
          agentId,
          initiator,
          title: input.prompt.slice(0, 80) || 'File discussion',
          source: 'cli',
        })
      );
    emit({ type: 'session', session });
    const root = realpathSync(input.root);
    const blocks: string[] = [];
    const attachments: { fileId: string }[] = [];
    for (const file of (input.attachments ?? []) as Attachment[]) {
      if (file.text !== undefined) {
        blocks.push(`Attached editor context: ${file.name}\n${file.text}`);
        continue;
      }
      let bytes: Buffer;
      if (file.path) {
        // Explicit file-picker selections may live outside the project. Still reject credentials and symlink aliases.
        safePath(dirname(file.path), file.path);
        const resolved = realpathSync(file.path);
        safePath(dirname(resolved), resolved);
        if (statSync(resolved).size > 10_000_000) throw new Error(`${file.name} exceeds 10 MB.`);
        bytes = readFileSync(resolved);
      } else bytes = Buffer.from(file.data ?? '', 'base64');
      if (bytes.length > 10_000_000) throw new Error(`${file.name} exceeds 10 MB.`);
      const ext = extname(file.name).toLowerCase();
      const binary =
        ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.docx', '.xlsx', '.pptx'].includes(
          ext
        ) || bytes.includes(0);
      if (!binary && bytes.length <= 100_000)
        blocks.push(`Attached file: ${file.name}\n${bytes.toString('utf8')}`);
      else {
        const mime =
          file.mime ||
          (
            {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.webp': 'image/webp',
              '.gif': 'image/gif',
              '.pdf': 'application/pdf',
            } as Record<string, string>
          )[ext] ||
          'application/octet-stream';
        const uploaded = unwrap(
          await client.files.upload(
            [
              {
                name: basename(file.name),
                data: new Blob([new Uint8Array(bytes)], { type: mime }),
              },
            ],
            { agentId, sessionId: session.sessionId }
          )
        );
        for (const item of uploaded) attachments.push({ fileId: item.fileId });
      }
    }
    const local: LocalToolsConfig = {
      rootDir: root,
      sessionId: session.sessionId,
      agentId,
      appendLog() {},
      signal: commands.signal,
      permissions: new Map(
        input.mode === 'read-only'
          ? ['write_file', 'run_command', 'start_process'].map((key) => [key, 'deny' as const])
          : []
      ),
      confirm: (message, tool) =>
        new Promise((resolve) => {
          const id = randomUUID();
          approvals.set(id, resolve);
          emit({ type: 'approval', id, tool, message: message.replace(/\x1b\[[0-9;]*m/g, '') });
        }),
    };
    if (input.mode !== 'off') {
      if (existsSync(join(root, 'AGENTS.md')))
        blocks.push(`Project instructions (AGENTS.md):\n${readFileForContext(root, 'AGENTS.md')}`);
      for (const match of input.prompt.matchAll(/@([^\s]+)/g))
        blocks.push(`File ${match[1]}:\n${readFileForContext(root, match[1])}`);
      if (input.mode === 'read-only')
        blocks.push('Read-only mode: do not edit files or run commands.');
    }
    const cliContext =
      input.mode === 'off'
        ? blocks.join('\n\n')
        : buildLocalToolsManifest(root, buildDirSnapshot(root, 2), blocks);
    const changes = new Map<string, Change>();
    // Snapshot bounded text files before the turn, so command-driven edits can be reviewed too.
    async function snapshot() {
      const files = new Map<string, string | null>();
      try {
        const { stdout } = await exec(
          'git',
          ['ls-files', '-co', '--exclude-standard', '-z', '--', '.'],
          { cwd: root, maxBuffer: 2_000_000, timeout: 5000 }
        );
        let size = 0;
        for (const name of [...new Set(stdout.split('\0').filter(Boolean))]) {
          try {
            const path = safePath(root, name),
              length = statSync(path).size;
            files.set(path, null);
            if (length > 500_000 || size + length > 10_000_000) continue;
            const bytes = readFileSync(path);
            if (bytes.includes(0)) continue;
            files.set(path, bytes.toString('utf8'));
            size += length;
          } catch {}
        }
      } catch {}
      return files;
    }
    const initial = input.mode === 'ask' ? await snapshot() : new Map<string, string | null>();
    async function commandChanges() {
      const after = await snapshot();
      for (const path of new Set([...initial.keys(), ...after.keys()])) {
        if (initial.get(path) === null || after.get(path) === null) continue;
        if (!after.has(path) && existsSync(path)) continue;
        const beforeText = initial.get(path) ?? '',
          afterText = after.get(path) ?? '';
        if (beforeText !== afterText)
          changes.set(path, {
            id: changes.get(path)?.id ?? randomUUID(),
            path,
            before: beforeText,
            after: afterText,
            ...changeCounts(beforeText, afterText),
          });
      }
      if (changes.size) emit({ type: 'changes', changes: [...changes.values()] });
    }
    async function tool(name: string, args: any, id: string) {
      const label = name.replace(/^cli_/, '');
      emit({
        type: 'activity',
        activity: {
          id,
          label: label.replaceAll('_', ' '),
          detail: JSON.stringify(args, null, 2).slice(0, 16000),
          status: 'running',
        },
      });
      let before: string | undefined;
      if (label === 'write_file') {
        try {
          const path = safePath(root, args.path);
          before = existsSync(path) ? readFileSync(path, 'utf8') : '';
        } catch {}
      }
      const result =
        input.mode === 'off'
          ? 'Local tools are disabled.'
          : args.interactive
          ? 'Error: interactive commands are unavailable in chat. Use a noninteractive command.'
          : await runLocalTool({ tool: label, args }, local);
      if (before !== undefined && result.startsWith('Written ')) {
        const path = safePath(root, args.path),
          after = readFileSync(path, 'utf8');
        const original = changes.get(path)?.before ?? before;
        changes.set(path, {
          id: changes.get(path)?.id ?? randomUUID(),
          path,
          before: original,
          after,
          ...changeCounts(original, after),
        });
        emit({ type: 'changes', changes: [...changes.values()] });
      }
      emit({
        type: 'activity',
        activity: {
          id,
          label: label.replaceAll('_', ' '),
          detail: `${JSON.stringify(args, null, 2).slice(0, 16000)}\n\n${result.slice(0, 24000)}`,
          status: /^(Error:|User denied|Local tools are disabled)/.test(result) ? 'error' : 'done',
        },
      });
      return result;
    }
    let prompt = input.prompt || 'Please review the attached files.';
    for (let depth = 0; depth < 10; depth++) {
      let content = '',
        sawFinal = false;
      for await (const event of client.agents.stream({
        agentId,
        initiatorId: initiator,
        sessionId: session.sessionId,
        messages: [{ role: 'user', content: prompt }],
        cliContext,
        ...(depth === 0 && attachments.length ? { attachments } : {}),
      })) {
        const e = event as any;
        if (e.type === 'token') {
          content += e.content ?? '';
          emit({ type: 'token', content: e.content ?? '' });
        } else if (e.type === 'cli_tool_request') {
          const result = await tool(e.tool, e.args ?? {}, e.requestId);
          await client.agents.submitCliToolResult(e.requestId, result);
        } else if (e.type === 'toolStart' || e.type === 'toolEnd') {
          emit({
            type: 'activity',
            activity: {
              id: e.toolCallId ?? e.toolName,
              label: e.toolName ?? 'Agent tool',
              detail: textContent(e.result) || JSON.stringify(e.args ?? {}),
              status: e.type === 'toolStart' ? 'running' : 'done',
            },
          });
        } else if (e.type === 'error')
          throw new Error(e.message ?? 'The response failed. Try again.');
        else if (e.type === 'final') {
          if (!content) {
            content = textContent(e.payload);
            emit({ type: 'token', content });
          }
          sawFinal = true;
          break;
        }
      }
      if (!sawFinal)
        throw new Error(
          'The connection ended before the response completed. You can send a follow-up to continue.'
        );
      const call = extractToolCall(content);
      if (!call || input.mode === 'off') break;
      const result = await tool(call.tool, call.args, randomUUID());
      prompt = `[Tool result: ${call.tool}]\n${result}`;
      emit({ type: 'token', content: '\n\n' });
      if (depth === 9) throw new Error('Tool limit reached. Send a follow-up to continue.');
    }
    if (input.mode === 'ask') await commandChanges();
    return session;
  } finally {
    running = false;
  }
}
async function dispatch(method: string, params: any) {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error(
      'Node.js 22 or newer is required. Update Node or set Agent Commons: Node Path.'
    );
  if (method === 'account') return account();
  if (method === 'login') return login();
  if (method === 'logout') {
    clearConfig();
    return account();
  }
  if (method === 'send') return send(params);
  const cfg = await ensureAccessToken(),
    client = makeClient();
  const user = cfg.userId ?? cfg.initiator;
  if (!user) throw new Error('Sign in to continue.');
  if (method === 'agents') return unwrap(await client.agents.list(user));
  if (method === 'sessions') return unwrap(await client.sessions.listByUser(user));
  if (method === 'history')
    return {
      ...unwrap(await client.sessions.get(params.id)),
      messages: transcript(unwrap(await client.sessions.getChat(params.id))),
    };
  if (method === 'rename') return unwrap(await client.sessions.rename(params.id, params.title));
  throw new Error('Unknown runtime request.');
}
process.on('message', async (message: any) => {
  if (message.method === 'approve') {
    approvals.get(message.params.id)?.(message.params.allow === true);
    approvals.delete(message.params.id);
    return;
  }
  try {
    const result = await dispatch(message.method, message.params ?? {});
    process.send?.({ id: message.id, result });
  } catch (error) {
    process.send?.({
      id: message.id,
      error: error instanceof Error ? error.message : 'Request failed.',
    });
  }
});
function stop() {
  commands.abort();
  stopLocalProcesses();
  process.exit(0);
}
process.on('disconnect', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
