import assert from 'node:assert/strict';
import test from 'node:test';
import { encode } from 'next-auth/jwt';
import { readDesktopSession } from './desktop-session.ts';

test('native account verification decodes real encrypted cookies without network requests or cookie rotation', async () => {
  const secret = 'test-only-desktop-signing-secret-with-enough-entropy';
  const cookie = 'authjs.agent-commons.session-token.v2';
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Account verification contacted a cloud service'); };
  try {
    for (const id of ['account-A','account-B']) {
      const token = await encode({ secret, salt:cookie, token:{sub:id,identityUserId:id,name:'Same name',authSessionVersion:'v2',accessToken:'never expose',accessTokenExpiresAt:1}, maxAge:3600 });
      const headers = new Headers({cookie:`${cookie}=${token}`});
      assert.deepEqual(await readDesktopSession(headers,secret,'v2'), {user:{id,name:'Same name',email:null,image:null}});
      assert.equal(await readDesktopSession(headers,'wrong-secret','v2'),null);
    }
    assert.equal(await readDesktopSession(new Headers(),secret,'v2'),null);
    const expired = await encode({secret,salt:cookie,token:{sub:'account-A',authSessionVersion:'v2'},maxAge:-60});
    assert.equal(await readDesktopSession(new Headers({cookie:`${cookie}=${expired}`}),secret,'v2'),null);
  } finally {globalThis.fetch=original;}
});
