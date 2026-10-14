import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopRequestPolicy } from './desktop-request-policy.ts';

test('Local renderer APIs stay on device, while the main process can verify the actual account session', () => {
  const local = { server: true, local: true, mainToken: 'process-only-capability', suppliedToken: null };
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/auth/session' }), 'local-session');
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/connected-apps' }), 'block-cloud-api');
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/connected-apps', suppliedToken: 'wrong-capability' }), 'block-cloud-api');
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/auth/session', suppliedToken: local.mainToken }), 'native');
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/oauth/connect', suppliedToken: local.mainToken }), 'native');
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/oauth/connect', mainToken: undefined, suppliedToken: '' }), 'block-cloud-api');
});

test('Local users can sign out without opening cloud APIs, and web deployments cannot accept the native capability', () => {
  const local = { server: true, local: true, suppliedToken: null };
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/auth/csrf' }), 'auth');
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/auth/signout' }), 'auth');
  assert.equal(desktopRequestPolicy({ ...local, path: '/api/library' }), 'block-cloud-api');
  assert.equal(desktopRequestPolicy({ ...local, path: '/library' }), 'local-page');
  assert.equal(desktopRequestPolicy({ server: false, local: true, path: '/api/connected-apps', mainToken: 'same', suppliedToken: 'same' }), 'cloud');
});
