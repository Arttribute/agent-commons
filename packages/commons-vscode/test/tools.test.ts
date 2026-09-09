import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safePath, readFileForContext, runLocalTool, type LocalToolsConfig } from '../../agc-cli/src/local-tools';

function fixture(t: any) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'commons-test-')));
  const root = join(base, 'project');
  const outside = join(base, 'outside');
  mkdirSync(root); mkdirSync(outside);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const cfg: LocalToolsConfig = { rootDir: root, sessionId: 'test', appendLog() {}, permissions: new Map() };
  return { base, root, outside, cfg };
}
test('file access rejects traversal, symlink escape, and dangling symlinks', t => {
  const { root, outside } = fixture(t);
  writeFileSync(join(outside, 'secret'), 'secret');
  symlinkSync(outside, join(root, 'link'), 'junction');
  symlinkSync(join(outside, 'missing'), join(root, 'dangling'));
  assert.throws(() => safePath(root, '../outside/secret'), /escapes/);
  assert.throws(() => safePath(root, 'link/secret'), /outside/);
  assert.throws(() => safePath(root, 'link/new/file'), /outside/);
  assert.throws(() => safePath(root, 'dangling'), /Dangling/);
  assert.match(readFileForContext(root, 'link/secret'), /error/);
});
test('sensitive directories and indirect sensitive targets are blocked', t => {
  const { root } = fixture(t);
  mkdirSync(join(root, '.ssh'));
  writeFileSync(join(root, '.env'), 'secret');
  symlinkSync(join(root, '.env'), join(root, 'innocent.txt'));
  assert.throws(() => safePath(root, '.ssh'), /blocked/);
  assert.throws(() => safePath(root, 'innocent.txt'), /blocked/);
  assert.match(readFileForContext(root, '.env'), /blocked/);
});
test('normal nested writes and parent-looking filenames are allowed', async t => {
  const { root, cfg } = fixture(t);
  cfg.permissions.set('write_file', 'allow');
  const result = await runLocalTool({ tool: 'write_file', args: { path: 'src/..notes', content: 'hello' } }, cfg);
  assert.match(result, /Written/);
  assert.equal(readFileSync(join(root, 'src/..notes'), 'utf8'), 'hello');
});
test('read-only permissions deny mutation and execution even when auto-approve is set', async t => {
  const { root, cfg } = fixture(t);
  writeFileSync(join(root, 'file'), 'original');
  cfg.autoApprove = true;
  for (const tool of ['write_file', 'run_command', 'start_process']) cfg.permissions.set(tool, 'deny');
  assert.match(await runLocalTool({ tool: 'write_file', args: { path: 'file', content: 'changed' } }, cfg), /denied/);
  assert.match(await runLocalTool({ tool: 'run_command', args: { command: process.execPath, args: ['-e', 'process.exit(0)'] } }, cfg), /denied/);
  assert.match(await runLocalTool({ tool: 'start_process', args: { command: process.execPath } }, cfg), /denied/);
  assert.equal(readFileSync(join(root, 'file'), 'utf8'), 'original');
  assert.equal(await runLocalTool({ tool: 'read_file', args: { path: 'file' } }, cfg), 'original');
});
test('commands that produce output and fail still report failure', async t => {
  const { cfg } = fixture(t);
  cfg.permissions.set('run_command', 'allow');
  const result = await runLocalTool({ tool: 'run_command', args: { command: process.execPath, args: ['-e', 'console.log("test output"); process.exit(2)'] } }, cfg);
  assert.match(result, /Error: command failed/);
  assert.match(result, /test output/);
});

test('edit preview shows changed lines, omits distant context, and strips escape sequences', async () => {
  const { editPreview } = await import('../../agc-cli/src/edit-preview');
  const preview = editPreview('keep\nold\ntail', 'keep\nnew\u001b[2J\ntail');
  assert.match(preview, /-old/);
  assert.match(preview, /\+new/);
  assert.doesNotMatch(preview, /\u001b/);
  assert.equal(editPreview('same', 'same'), '(no content change)');
  assert.match(editPreview('', 'a'.repeat(100), 20), /truncated/);
});
test('embedded approval handler cannot bypass denied permissions and detects concurrent edits', async t => {
  const { root, cfg } = fixture(t);
  writeFileSync(join(root, 'file'), 'original');
  let approvals = 0;
  cfg.confirm = async () => { approvals++; writeFileSync(join(root, 'file'), 'user edit'); return true; };
  const call = { tool: 'write_file', args: { path: 'file', content: 'agent edit' } };
  assert.match(await runLocalTool(call, cfg), /file changed during approval/);
  assert.equal(readFileSync(join(root, 'file'), 'utf8'), 'user edit');
  cfg.permissions.set('write_file', 'deny');
  assert.match(await runLocalTool(call, cfg), /denied/);
  assert.equal(approvals, 1);
});
test('stopping an embedded session aborts its foreground command', async t => {
  const { cfg } = fixture(t);
  cfg.permissions.set('run_command', 'allow');
  const controller = new AbortController(); cfg.signal = controller.signal;
  const running = runLocalTool({ tool: 'run_command', args: { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] } }, cfg);
  setTimeout(() => controller.abort(), 50);
  assert.match(await running, /Error:.*abort/i);
});
