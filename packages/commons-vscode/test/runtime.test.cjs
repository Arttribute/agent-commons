const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'commons-chat-test-'));
  await fs.mkdir(path.join(root, '.agc'));
  await fs.writeFile(
    path.join(root, '.agc/config.json'),
    JSON.stringify(
      options.signedOut
        ? {}
        : {
            apiKey: 'fixture-key',
            initiator: 'fixture-user',
            defaultAgentId: options.staleDefault ? 'old-account-agent' : 'agent-1',
          }
    )
  );
  await fs.writeFile(path.join(root, 'AGENTS.md'), 'Verify all edits.');
  await fs.writeFile(path.join(root, 'hello.txt'), 'Before');
  await fs.writeFile(
    path.join(root, 'home.cjs'),
    `require('node:os').homedir = () => ${JSON.stringify(root)};`
  );
  const calls = [],
    results = [],
    events = [];
  let pendingResponse,
    upload = false,
    devicePolls = 0;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw && !req.url.includes('/files/upload') ? JSON.parse(raw) : {};
    const json = (value) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.url === '/api/auth/device/code')
      return json({
        device_code: 'fixture-device',
        user_code: 'ABCD-EFGH',
        verification_uri: `http://127.0.0.1:${server.address().port}/device`,
        expires_in: 30,
        interval: 1,
      });
    if (req.url === '/api/auth/device/token') {
      devicePolls++;
      return json({ access_token: 'fixture-session-token' });
    }
    if (req.url === '/api/auth/token')
      return json({
        token:
          'fixture.' +
          Buffer.from(
            JSON.stringify({
              sub: 'fixture-user',
              email: 'test@example.com',
              exp: Math.floor(Date.now() / 1000) + 3600,
            })
          ).toString('base64url') +
          '.sig',
      });
    if (req.url === '/v1/agents/run/stream') {
      calls.push(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ type: 'token', content: 'Working. ' })}\n\n`);
      if (options.disconnect) return res.end();
      if (options.hang) {
        pendingResponse = res;
        return;
      }
      res.write(
        `data: ${JSON.stringify({
          type: 'cli_tool_request',
          requestId: 'tool-1',
          tool: 'cli_write_file',
          args: { path: 'hello.txt', content: 'After' },
        })}\n\n`
      );
      pendingResponse = res;
      return;
    }
    if (req.url === '/v1/agents/cli-tool-result') {
      results.push(body);
      json({});
      pendingResponse.write(`data: ${JSON.stringify({ type: 'token', content: 'Finished.' })}\n\n`);
      pendingResponse.end(
        `data: ${JSON.stringify({ type: 'final', payload: { content: 'Working. Finished.' } })}\n\n`
      );
      return;
    }
    if (req.url === '/v1/files/upload') {
      upload = raw.includes('picture.png');
      return json({ data: [{ fileId: 'file-1' }] });
    }
    if (req.url.startsWith('/v1/agents?'))
      return json({ data: [{ agentId: 'agent-1', name: 'My agent', isDefault: true }] });
    if (req.url.endsWith('/chat'))
      return json({
        data: {
          history: [
            { role: 'human', content: 'Earlier question' },
            { role: 'ai', content: 'Earlier answer' },
          ],
        },
      });
    if (req.url.includes('/sessions/user/'))
      return json({
        data: [{ sessionId: 'existing-session', agentId: 'original-agent', title: 'Earlier chat' }],
      });
    return json({
      data: {
        sessionId: 'fixture-session',
        agentId: req.method === 'GET' ? 'original-agent' : 'agent-1',
        title: 'Fixture chat',
      },
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^(AGC_|COMMONS_|NODE_OPTIONS|NODE_PATH)/.test(k))
  );
  env.AGC_API_URL = `http://127.0.0.1:${server.address().port}`;
  env.COMMONS_IDENTITY_URL = env.AGC_API_URL;
  const child = fork(path.resolve('.test-build/runtime.cjs'), [], {
    cwd: root,
    execArgv: ['--require', path.join(root, 'home.cjs')],
    env,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const pending = new Map();
  let seq = 0;
  child.on('message', (message) => {
    if (message.event) {
      events.push(message.event);
      if (message.event.type === 'approval' && options.approve !== undefined)
        child.send({ method: 'approve', params: { id: message.event.id, allow: options.approve } });
      return;
    }
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    message.error ? item.reject(new Error(message.error)) : item.resolve(message.result);
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = String(++seq);
      pending.set(id, { resolve, reject });
      child.send({ id, method, params });
    });
  t.after(async () => {
    child.kill();
    await once(child, 'exit');
    server.closeAllConnections();
    server.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return {
    root,
    child,
    calls,
    results,
    events,
    rpc,
    uploaded: () => upload,
    polls: () => devicePolls,
  };
}
for (const [name, mode, approve] of [
  ['approved edit', 'ask', true],
  ['declined edit', 'ask', false],
  ['read-only', 'read-only', undefined],
  ['tools off', 'off', undefined],
]) {
  test(`background chat: ${name}`, { timeout: 15000 }, async (t) => {
    const f = await fixture(t, { approve });
    await f.rpc('send', {
      prompt: 'Fix the greeting',
      root: f.root,
      mode,
      sessionId: 'existing-session',
      agentId: 'wrong-agent',
      attachments: [
        { name: 'Selection', text: 'unsaved editor context' },
        { name: 'picture.png', data: Buffer.from('fixture image').toString('base64') },
      ],
    });
    assert.equal(f.calls[0].agentId, 'original-agent');
    assert.match(f.calls[0].cliContext, /unsaved editor context/);
    assert.equal(f.uploaded(), true);
    assert.deepEqual(f.calls[0].attachments, [{ fileId: 'file-1' }]);
    assert.equal(
      f.events
        .filter((e) => e.type === 'token')
        .map((e) => e.content)
        .join(''),
      'Working. Finished.'
    );
    assert.equal(
      await fs.readFile(path.join(f.root, 'hello.txt'), 'utf8'),
      approve === true ? 'After' : 'Before'
    );
    assert.equal(
      f.events.some((e) => e.type === 'approval'),
      mode === 'ask'
    );
    assert.equal(
      f.events.some((e) => e.type === 'changes'),
      approve === true
    );
    if (approve === true)
      assert.equal(f.events.find((e) => e.type === 'changes').changes[0].before, 'Before');
    assert.equal(f.results.length, 1);
    const history = await f.rpc('history', { id: 'existing-session' });
    assert.deepEqual(
      history.messages.map((m) => m.content),
      ['Earlier question', 'Earlier answer']
    );
  });
}
test(
  'sign-in uses device approval and only exposes account display fields',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t, { signedOut: true });
    assert.equal((await f.rpc('account')).authenticated, false);
    const account = await f.rpc('login');
    assert.equal(account.email, 'test@example.com');
    assert.equal(account.authenticated, true);
    assert.equal(f.polls(), 1);
    assert.equal(JSON.stringify(account).includes('token'), false);
    assert.equal(f.events.find((e) => e.type === 'device').code, 'ABCD-EFGH');
    assert.equal((await f.rpc('logout')).authenticated, false);
  }
);
test(
  'an interrupted stream reports failure instead of successful completion',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t, { disconnect: true });
    await assert.rejects(
      f.rpc('send', { prompt: 'test', root: f.root, mode: 'off' }),
      /connection ended/
    );
  }
);

test(
  'a stale CLI default cannot select a previous account agent',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t, { staleDefault: true, approve: false });
    await f.rpc('send', { prompt: 'test', root: f.root, mode: 'off' });
    assert.equal(f.calls[0].agentId, 'agent-1');
    assert.equal(f.calls[0].initiatorId, 'fixture-user');
  }
);
