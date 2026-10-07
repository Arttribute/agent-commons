import assert from 'node:assert/strict';
import test from 'node:test';
import Module, { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'tsup';

test('account switching separates real local agents, files, canvas notes, secrets and preferences and restores each profile', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-account-switch-'));
  const output = join(import.meta.dirname, '../node_modules/.cache/profiles-test');
  await build({ entry: { runtime: join(import.meta.dirname, 'runtime.ts'), profiles: join(import.meta.dirname, 'local-profiles.ts') }, outDir: output, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', external: ['electron'], noExternal: ['@agent-commons/agent-core', '@agent-commons/desktop-contract'], silent: true });
  const original = Module._load;
  let PrivateLocalRuntime, LocalProfiles;
  try {
    Module._load = function(name, ...args) { if (name === 'electron') return { safeStorage: { isEncryptionAvailable: () => false } }; return original.call(this, name, ...args); };
    const require = createRequire(import.meta.url);
    ({ PrivateLocalRuntime } = require(join(output, 'runtime.cjs')));
    ({ LocalProfiles } = require(join(output, 'profiles.cjs')));
  } finally { Module._load = original; }
  const accountA = { userId: 'account-A', displayName: 'Same display name' };
  const accountB = { userId: 'account-B', displayName: 'Same display name' };
  let runtime = new PrivateLocalRuntime(root);
  try {
    runtime.syncAccount(accountA);
    runtime.saveAgent({ name: 'A private agent', model: 'A-model', instructions: 'Private A' });
    runtime.updateSettings({ defaultModel: 'A-default', webSearchApiKey: 'A-private-key' });
    runtime.syncPreferences({ pinnedAppIds: { value: ['A-app'], updatedAt: 123 } }, 'private-local');
    const [file] = runtime.importLibraryFiles([{ name: 'A-private.txt', mimeType: 'text/plain', bytes: Buffer.from('Account A only') }]);
    const canvas = runtime.canvas.open(file.id);
    runtime.canvas.createNote(canvas.project.projectId, { kind: 'comment', body: 'A private note', revisionId: canvas.revisions[0].revisionId });
    const profiles = new LocalProfiles(root, runtime.state().account.userId);
    assert.equal(profiles.directory, root, 'Legacy data should keep its original absolute file paths');
    const old = runtime; old.close();
    runtime = new PrivateLocalRuntime(profiles.select(accountB.userId), root);
    runtime.syncAccount(accountB);
    assert.equal(runtime.state().account.userId, 'account-B');
    assert.equal(runtime.state().library.length, 0);
    assert.ok(!runtime.state().agents.some((agent) => agent.name === 'A private agent'));
    assert.notEqual(runtime.state().settings.defaultModel, 'A-default');
    assert.equal(runtime.state().settings.webSearchApiKey, undefined);
    assert.equal(runtime.preferences().pinnedAppIds, undefined);
    assert.throws(() => runtime.canvas.get(canvas.project.projectId), /not found/i);
    assert.throws(() => old.updateSettings({ defaultModel: 'late-write' }), /account changed/);
    runtime.saveAgent({ name: 'B private agent', model: 'B-model', instructions: 'Private B' });
    runtime.close();
    runtime = new PrivateLocalRuntime(profiles.select(null), root);
    assert.equal(runtime.state().account, undefined);
    assert.equal(runtime.state().library.length, 0);
    assert.ok(!runtime.state().agents.some((agent) => agent.name.includes('private agent')));
    runtime.close();
    runtime = new PrivateLocalRuntime(profiles.select(accountA.userId), root);
    assert.equal(runtime.state().settings.defaultModel, 'A-default');
    assert.equal(runtime.state().settings.webSearchApiKey, 'A-private-key');
    assert.deepEqual(runtime.preferences().pinnedAppIds.value, ['A-app']);
    assert.equal((await runtime.readLibraryItem(file.id)).content, 'Account A only');
    assert.equal(runtime.canvas.get(canvas.project.projectId).annotations[0].body, 'A private note');
    assert.ok(!runtime.state().agents.some((agent) => agent.name === 'B private agent'));
    const restarted = new LocalProfiles(root, null);
    assert.equal(restarted.owner, accountA.userId, 'Offline restart should retain the selected profile');
    assert.equal(restarted.directory, root);
    assert.notEqual(restarted.select('../../other-account'), root, 'Principal IDs must not become filesystem paths');
  } finally { runtime.close(); rmSync(root, { recursive: true, force: true }); }
});

test('an existing anonymous profile is never assigned to the first signed-in account', async () => {
  const { LocalProfiles } = createRequire(import.meta.url)(join(import.meta.dirname, '../node_modules/.cache/profiles-test/profiles.cjs'));
  const root = mkdtempSync(join(tmpdir(), 'commons-guest-switch-'));
  try {
    const profiles = new LocalProfiles(root, null);
    assert.equal(profiles.directory, root);
    assert.notEqual(profiles.select('first-account'), root);
    assert.equal(profiles.select(null), root);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
