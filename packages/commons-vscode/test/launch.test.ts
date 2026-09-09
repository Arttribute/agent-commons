import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionArgs, insideRoot, nodeEnvironment, validMode } from '../src/launch';
import { resolve } from 'node:path';

test('launch arguments preserve spaces and shell metacharacters without shell evaluation', () => {
  const promptFile = '/tmp/folder with spaces/$(touch SHOULD_NOT_EXIST);prompt.txt';
  assert.deepEqual(sessionArgs({ agentId: 'agent-id', sessionId: 'session-id', promptFile, mode: 'read-only' }),
    ['code', '--agent', 'agent-id', '--resume', 'session-id', '--prompt-file', promptFile, '--read-only']);
});
test('default mode asks for permission; disabled tools are explicit', () => {
  assert.deepEqual(sessionArgs({ mode: 'ask' }), ['code']);
  assert.deepEqual(sessionArgs({ mode: 'off' }), ['code', '--no-local']);
  assert.equal(validMode('auto-approve'), 'ask');
});
test('workspace containment rejects siblings but permits names starting with dots', () => {
  const root = resolve('project');
  assert.equal(insideRoot(root, resolve(root, 'src/file.ts')), true);
  assert.equal(insideRoot(root, resolve(root, '..notes')), true);
  assert.equal(insideRoot(root, resolve(root, '../project-other/key')), false);
});
test('child environment strips Node preload injection without mutating host', () => {
  const env = { PATH: '/bin', NODE_OPTIONS: '--require /tmp/evil.js', NODE_PATH: '/tmp', ELECTRON_RUN_AS_NODE: '1' };
  assert.deepEqual(nodeEnvironment(env), { PATH: '/bin' });
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
});
