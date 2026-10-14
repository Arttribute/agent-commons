import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function harness({ env = {}, session = null, fetcher = () => { throw new Error('Unexpected fetch'); } } = {}) {
  const context = vm.createContext({ process: { env }, fetch: fetcher, AbortSignal, Date, URL });
  const loaded = new Map();
  const stubs = {
    'next/server': { NextResponse: { json: Response.json.bind(Response) } },
    '@/auth': { auth: async () => session },
    './app-url': { getAppBaseUrl: () => 'https://staging.agentcommons.io' },
  };
  async function load(name) {
    if (loaded.has(name)) return loaded.get(name);
    let module;
    if (stubs[name]) {
      const values = stubs[name];
      module = new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
    } else {
      const source = await readFile(new URL('./referral-server.ts', import.meta.url), 'utf8');
      module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, { context });
    }
    loaded.set(name, module);
    await module.link(load);
    return module;
  }
  const module = await load('referral-server');
  await module.evaluate();
  return module.namespace;
}

const request = () => ({ headers: new Headers({ Authorization: 'Bearer native-user-token' }) });

test('desktop links use a public HTTPS host even with a loopback auth origin or invalid override', async () => {
  for (const override of [undefined, 'http://localhost:1234', 'https://127.0.0.1']) {
    const module = await harness({ env: { COMMONS_DESKTOP_SERVER: '1', AUTH_URL: 'http://localhost:1234', ...(override ? { COMMONS_DESKTOP_CLOUD_URL: override } : {}) } });
    assert.equal(module.referralAppBaseUrl(), 'https://www.agentcommons.io');
  }
  assert.equal((await harness({ env: { COMMONS_DESKTOP_SERVER: '1', COMMONS_DESKTOP_CLOUD_URL: 'https://staging.agentcommons.io/' } })).referralAppBaseUrl(), 'https://staging.agentcommons.io');
});

test('native tokens are checked at trusted identity userinfo and retain only the verified user principal', async () => {
  let calls = 0;
  const module = await harness({ env: { COMMONS_IDENTITY_ISSUER: 'https://identity.test/api/auth/' }, fetcher: async (url, options) => {
    calls++;
    assert.equal(url, 'https://identity.test/api/auth/oauth2/userinfo');
    assert.equal(options.headers.Authorization, 'Bearer native-user-token');
    return Response.json({ sub: 'usr_alice', email: 'alice@example.com', email_verified: true, name: 'Alice' });
  } });
  const result = await module.referralSession(request());
  assert.equal(result.bearer, true);
  assert.equal(result.session.user.id, 'usr_alice');
  assert.equal(result.session.accessToken, 'native-user-token');
  assert.equal(calls, 1);
});

test('rejects forged/expired bearer tokens, service principals and unverified users', async () => {
  for (const [status, profile] of [[401, {}], [200, { sub: 'svc_agent_commons', email: 'service@example.com', email_verified: true }], [200, { sub: 'usr_alice', email: 'alice@example.com', email_verified: false }]]) {
    const module = await harness({ env: { COMMONS_IDENTITY_ISSUER: 'https://identity.test' }, fetcher: async () => Response.json(profile, { status }) });
    const result = await module.referralSession(request());
    assert.equal(result.session, null);
    assert.equal(result.bearer, false);
  }
});

test('desktop forwarding sends only the user token to the hosted referral route', async () => {
  const module = await harness({ env: { COMMONS_DESKTOP_SERVER: '1', COMMONS_DESKTOP_CLOUD_URL: 'https://staging.agentcommons.io', RESEND_API_KEY: 'must-not-send', AGENT_COMMONS_SERVICE_CLIENT_SECRET: 'must-not-send' }, fetcher: async (url, options) => {
    assert.equal(url, 'https://staging.agentcommons.io/api/referrals/email');
    assert.equal(options.headers.Authorization, 'Bearer user-token');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(Object.keys(options.headers).length, 2);
    assert.equal(options.body, JSON.stringify({ email: 'friend@example.com' }));
    return Response.json({ message: 'Invitation sent.' });
  } });
  assert.equal((await module.forwardDesktopReferral({ user: { id: 'usr_alice' }, accessToken: 'user-token' }, '/api/referrals/email', { email: 'friend@example.com' })).status, 200);
});
