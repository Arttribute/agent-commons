import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function cookieCommand(page, method, params) {
  const socket = new WebSocket(page);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Account test DevTools connection timed out')), 5000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Account test DevTools connection failed')); };
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Account test cookie operation timed out')), 5000);
      socket.onmessage = (event) => {
        const result = JSON.parse(event.data);
        if (result.id !== 1) return;
        clearTimeout(timer);
        if (result.error || result.result?.success === false) reject(new Error('Account test cookie operation failed'));
        else resolve();
      };
      socket.send(JSON.stringify({ id: 1, method, params }));
    });
  } finally { socket.close(); }
}

// Exercise the real loopback Auth.js session and native IPC boundary using
// test-only encrypted sessions. No identity-provider or customer account calls.
export async function smokeLocalAccounts(evaluate, page, userData) {
  const require = createRequire(new URL('../../commons-app/package.json', import.meta.url));
  const { encode } = await import(pathToFileURL(require.resolve('next-auth/jwt')).href);
  const secret = readFileSync(join(userData, 'commons-app-auth-secret'), 'utf8').trim();
  const cookie = `authjs.agent-commons.session-token.${(process.env.COMMONS_AUTH_SESSION_VERSION || 'v2').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const token = async (id) => encode({ secret, salt: cookie, token: { sub: id, identityUserId: id, name: 'Same display name', authSessionVersion: 'v2' }, maxAge: 3600 });
  const state = () => evaluate(page, 'window.agentCommonsLocal.getState()');
  const origin = await evaluate(page, 'location.origin');
  const waitFor = async (owner, previousDocument) => {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const ready = await evaluate(page, `document.readyState === 'complete' && !!document.body && ${previousDocument ? `performance.timeOrigin !== ${previousDocument}` : 'true'}`).catch(() => false);
      const current = ready ? await state().catch(() => undefined) : undefined;
      if (current && (current.account?.userId ?? null) === owner) return current;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Desktop did not select test account ${owner ?? 'guest'}`);
  };
  const select = async (id) => {
    const previous = await state();
    const previousDocument = id && previous.account?.userId !== id ? await evaluate(page, 'performance.timeOrigin') : undefined;
    const value = id ? await token(id) : '';
    // Auth.js rotates to HttpOnly cookies: use the browser cookie store just as
    // a sign-in response would, rather than trying to overwrite document.cookie.
    await cookieCommand(page, id ? 'Network.setCookie' : 'Network.deleteCookies', { name: cookie, url: origin + '/', ...(id ? { value, path: '/', httpOnly: true, sameSite: 'Lax' } : {}) });
    // A forged renderer principal must never determine which profile opens.
    await evaluate(page, "window.__accountTestSyncError = undefined; void window.agentCommonsDesktop.syncAccount({userId:'forged-renderer-principal'}).catch(error => { window.__accountTestSyncError = String(error.message || error); })");
    try {
      const selected = await waitFor(id, previousDocument);
      console.log(`Desktop smoke: selected ${id ?? 'guest'} profile.`);
      return selected;
    } catch (error) {
      const syncError = await evaluate(page, 'window.__accountTestSyncError').catch(() => undefined);
      throw new Error(`${error.message}${syncError ? `: ${syncError}` : ''}`);
    }
  };
  const original = await state();
  assert.equal(original.account, undefined, 'The smoke test must start in its isolated guest profile');
  try {
    await select('desktop-smoke-account-A');
    await evaluate(page, `(async () => {
      const bridge = window.agentCommonsLocal;
      await bridge.saveAgent({name:'A private smoke agent',model:'',instructions:'Account A only'});
      await bridge.updateSettings({webSearchApiKey:'A-smoke-private-key'});
      const uploaded = await bridge.apiRequest({path:'/api/files/upload',method:'POST',body:{files:[{name:'A-private-smoke.txt',mimeType:'text/plain',bytes:new TextEncoder().encode('A private smoke file')}]}});
      if (uploaded.status !== 200) throw new Error('Account A fixture upload failed');
    })()`);
    const a = await state();
    assert.ok(a.agents.some((agent) => agent.name === 'A private smoke agent'));
    const b = await select('desktop-smoke-account-B');
    assert.ok(!b.agents.some((agent) => agent.name === 'A private smoke agent'));
    assert.ok(!b.library.some((item) => item.name === 'A-private-smoke.txt'));
    assert.equal(b.settings.webSearchApiKey, undefined);
    await evaluate(page, "window.agentCommonsLocal.saveAgent({name:'B private smoke agent',model:'',instructions:'Account B only'})");
    const guest = await select(null);
    assert.deepEqual(guest.agents.map((agent) => agent.id), original.agents.map((agent) => agent.id));
    assert.equal(guest.settings.webSearchApiKey, original.settings.webSearchApiKey);
    const restored = await select('desktop-smoke-account-A');
    assert.ok(restored.agents.some((agent) => agent.name === 'A private smoke agent'));
    assert.ok(!restored.agents.some((agent) => agent.name === 'B private smoke agent'));
    assert.ok(restored.library.some((item) => item.name === 'A-private-smoke.txt'));
    assert.equal(restored.settings.webSearchApiKey, 'A-smoke-private-key');
    console.log('Desktop smoke: authenticated A → B → guest → A profiles are isolated; renderer principal ignored.');
  } finally { await select(null); }
}
