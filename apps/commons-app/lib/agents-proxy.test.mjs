import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual route, shared proxy, and credential selection together.
// Network and Auth.js are controlled; no live keys or identity service needed.
async function harness({ session = { user: { id: 'account-A', workspaceId: 'workspace-A' }, accessToken: 'rejected-user-token' }, rejectServiceOnce = false } = {}) {
  const calls = [];
  let minted = 0;
  const context = vm.createContext({
    Response, Headers, URL, URLSearchParams, Buffer, console,
    process: { env: {
      NEXT_PUBLIC_NEST_API_BASE_URL: 'https://backend.test',
      COMMONS_IDENTITY_ISSUER: 'https://identity.test',
      AGENT_COMMONS_SERVICE_CLIENT_ID: 'app-service',
      AGENT_COMMONS_SERVICE_CLIENT_SECRET: 'test-only',
      ALLOW_LEGACY_MANAGEMENT_AUTH: 'false',
    } },
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      if (url === 'https://identity.test/oauth2/token') {
        return Response.json({ access_token: `service-${++minted}`, expires_in: 600 });
      }
      if (options.headers.Authorization === 'Bearer rejected-user-token') {
        return Response.json({ message: 'Missing or invalid API key' }, { status: 401 });
      }
      if (rejectServiceOnce && options.headers.Authorization === 'Bearer service-1') {
        return Response.json({ message: 'Invalid service token' }, { status: 401 });
      }
      assert.equal(options.headers['x-owner-id'], 'account-A');
      assert.equal(options.headers['x-initiator'], 'account-A');
      return Response.json({ data: [{ agentId: 'owned-agent' }] });
    },
  });
  const root = new URL('../', import.meta.url);
  const loaded = new Map();
  async function load(name) {
    if (loaded.has(name)) return loaded.get(name);
    let module;
    if (name === '@/auth' || name === 'next/server') {
      const exports = name === '@/auth' ? { auth: async () => session } : { NextResponse: { json: Response.json } };
      module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context, identifier: name });
    } else {
      const file = name.startsWith('@/') ? `${name.slice(2)}.ts` : name;
      const source = await fs.readFile(new URL(file, root), 'utf8');
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
      module = new vm.SourceTextModule(compiled, { context, identifier: name });
    }
    loaded.set(name, module);
    await module.link(load);
    return module;
  }
  const route = await load('app/api/agents/route.ts');
  await route.evaluate();
  return { route: route.namespace, calls };
}

test('a backend-rejected user token cannot break the signed-in agent list', async () => {
  const { route, calls } = await harness();
  const response = await route.GET(new Request('https://app.test/api/agents?owner=another-account'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [{ agentId: 'owned-agent' }] });
  const backend = calls.filter(c => c.url.startsWith('https://backend.test'));
  assert.equal(backend.length, 1);
  assert.equal(backend[0].url, 'https://backend.test/v1/agents?owner=account-A');
  assert.equal(backend[0].headers.Authorization, 'Bearer service-1');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('agent listing remints a rejected cached service credential', async () => {
  const { route, calls } = await harness({ rejectServiceOnce: true });
  assert.equal((await route.GET(new Request('https://app.test/api/agents'))).status, 200);
  assert.equal(calls.filter(c => c.url === 'https://identity.test/oauth2/token').length, 2);
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer service-2');
});

test('signed-out browsers cannot use app service credentials', async () => {
  const { route, calls } = await harness({ session: null });
  assert.equal((await route.GET(new Request('https://app.test/api/agents'))).status, 401);
  assert.equal((await route.POST(new Request('https://app.test/api/agents', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal(calls.length, 0);
});

test('agent creation shares proxy recovery and replaces browser ownership fields', async () => {
  const { route, calls } = await harness({ rejectServiceOnce: true });
  const response = await route.POST(new Request('https://app.test/api/agents', {
    method: 'POST', body: JSON.stringify({ name: 'My agent', owner: 'other', ownerUserId: 'other', workspaceId: 'other-workspace' }),
  }));
  assert.equal(response.status, 200);
  const backend = calls.filter(c => c.url.startsWith('https://backend.test'));
  assert.equal(backend.length, 2);
  assert.equal(backend[1].method, 'POST');
  assert.deepEqual(JSON.parse(backend[1].body), { name: 'My agent', owner: 'account-A', ownerUserId: 'account-A', workspaceId: 'workspace-A' });
});
