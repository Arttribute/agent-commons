import assert from 'node:assert/strict';
import test from 'node:test';
import { trustedDisplayCapture } from './display-capture-policy.ts';

test('only the current Commons top-level document can choose a recording source', () => {
  const frame = {};
  const state = { contents: { mainFrame: frame, isDestroyed: () => false }, origin: 'http://127.0.0.1:41500', generation: 3, mode: 'private-local', changing: false };
  const request = { frame, securityOrigin: state.origin, userGesture: true, videoRequested: true };
  assert.equal(trustedDisplayCapture(request, state, state), true);
  for (const change of [{ frame: {} }, { securityOrigin: 'https://external.invalid' }, { userGesture: false }, { videoRequested: false }]) {
    assert.equal(trustedDisplayCapture({ ...request, ...change }, state, state), false);
  }
  for (const change of [{ generation: 4 }, { mode: 'cloud' }, { changing: true }, { contents: null }, { contents: { mainFrame: frame, isDestroyed: () => true } }]) {
    assert.equal(trustedDisplayCapture(request, state, { ...state, ...change }), false);
  }
});
