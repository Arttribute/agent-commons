import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { build } from 'tsup';

const output = resolve(import.meta.dirname, '../node_modules/.cache/image-lifecycle-test');
await build({ entry: { image: resolve(import.meta.dirname, 'local-image.ts') }, outDir: output, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', noExternal: [/.*/], silent: true });
const { LocalImageManager } = createRequire(import.meta.url)(join(output, 'image.cjs'));

test('closed account cannot start image preparation or generation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-image-closed-'));
  try {
    const manager = new LocalImageManager(root, () => {});
    manager.close();
    await assert.rejects(manager.prepare(), /account changed/);
    await assert.rejects(manager.generate('private old account prompt'), /account changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('account closure terminates its running image process before output cleanup', { skip: process.platform === 'win32' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-image-cancel-'));
  let manager;
  try {
    const runtime = join(root, 'image-generation/runtime');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'sd-cli'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync("started",String(process.pid)); process.on("SIGTERM",()=>{});setInterval(()=>{},1000);\n', { mode: 0o700 });
    manager = new LocalImageManager(root, () => {});
    writeFileSync(join(manager.modelDirectory(), 'fixture.gguf'), 'fixture');
    const running = manager.generate('private prompt', 'fixture.gguf');
    const rejected = assert.rejects(running, /abort|account changed/i);
    const marker = join(root, 'image-generation/started');
    for (let attempt = 0; attempt < 500 && !existsSync(marker); attempt++) await delay(20);
    assert.ok(existsSync(marker), 'Image child never started');
    const pid = Number(readFileSync(marker, 'utf8'));
    manager.close();
    await rejected;
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally { manager?.close(); rmSync(root, { recursive: true, force: true }); }
});
