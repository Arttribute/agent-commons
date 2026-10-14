import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('../app/api/referrals/email/route.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const session = { user: { id: 'usr_alice', email: 'alice@example.com', name: 'Alice' } };

async function route({ user = session, fetcher, configured = true } = {}) {
  const context = vm.createContext({ process: { env: configured ? { RESEND_API_KEY: 'test-key', NEXT_PUBLIC_NEST_API_BASE_URL: 'https://backend.test' } : {} }, fetch: fetcher, AbortSignal });
  const modules = {
    'next/server': { NextResponse: { json: Response.json.bind(Response) } },
    '@/auth': { auth: async () => user },
    '@/lib/api-headers': { backendServiceAuthHeaders: async () => ({ Authorization: 'Bearer service-token' }) },
    '@/lib/app-url': { getAppBaseUrl: () => 'https://staging.agentcommons.io' },
    '@/lib/referrals': { referralMessage: (url) => `Join me on Agent Commons. ${url}` },
  };
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    const values = modules[specifier];
    assert.ok(values, `Unexpected import ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [name, value] of Object.entries(values)) this.setExport(name, value); }, { context });
  });
  await module.evaluate();
  return module.namespace.POST;
}
const request = (email = ' Friend@Example.com ', origin = 'https://staging.agentcommons.io') => ({
  headers: new Headers({ origin }), nextUrl: { origin: 'https://staging.agentcommons.io' }, json: async () => ({ email }),
});

test('email sending requires a same-origin authenticated account and configured credentials', async () => {
  let calls = 0;
  const fetcher = () => { calls++; throw new Error('Unexpected send'); };
  assert.equal((await (await route({ fetcher }))(request('friend@example.com', 'https://attacker.test'))).status, 403);
  assert.equal((await (await route({ fetcher, user: null }))(request())).status, 401);
  assert.equal((await (await route({ fetcher, configured: false }))(request())).status, 503);
  assert.equal(calls, 0);
});

test('reserves the normalized recipient and sends an attributable invitation with a stable Resend key', async () => {
  const calls = [];
  const handler = await route({ fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/invitations')) return Response.json({ data: { invitationId: 'fixed-invite', email: 'friend@example.com', code: 'unique-code' } });
    return Response.json({ id: 'provider-id' });
  } });
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls.length, 3);
  assert.equal(JSON.parse(calls[0].options.body).email, 'friend@example.com');
  assert.equal(calls[0].options.headers['x-initiator'], 'usr_alice');
  const sent = calls[1];
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(sent.options.headers['Idempotency-Key'], 'referral/fixed-invite');
  assert.ok(JSON.parse(sent.options.body).text.includes('https://staging.agentcommons.io/r/unique-code'));
  assert.equal(JSON.parse(calls[2].options.body).sent, true);
});

test('duplicate recipients and server limits prevent additional emails', async () => {
  let sends = 0;
  for (const [status, data] of [[200, { data: { alreadySent: true } }], [429, { message: 'Daily limit reached' }]]) {
    const handler = await route({ fetcher: async (url) => { if (url.includes('resend.com')) sends++; return Response.json(data, { status }); } });
    assert.equal((await handler(request())).status, status);
  }
  assert.equal(sends, 0);
});

test('an ambiguous provider timeout leaves the reservation pending for an idempotent retry', async () => {
  const calls = [];
  const handler = await route({ fetcher: async (url) => {
    calls.push(url);
    if (url.endsWith('/invitations')) return Response.json({ data: { invitationId: 'stable-invite', email: 'friend@example.com', code: 'code' } });
    throw new Error('Timed out after send');
  } });
  assert.equal((await handler(request())).status, 502);
  assert.equal(calls.length, 2);
  assert.equal(calls.some((url) => url.endsWith('/complete')), false);
});
