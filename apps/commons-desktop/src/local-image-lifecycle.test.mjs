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


test('negative prompts remain literal CLI arguments and preserve default generation settings', { skip: process.platform === 'win32' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-image-negative-'));
  let manager;
  try {
    const runtime = join(root, 'image-generation/runtime');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'sd-cli'), '#!/usr/bin/env node\nconst fs=require("node:fs"); const args=process.argv.slice(2);fs.writeFileSync("argv.json",JSON.stringify(args));fs.writeFileSync(args[args.indexOf("-o")+1],Buffer.from([1,2,3]));\n', { mode: 0o700 });
    manager = new LocalImageManager(root, () => {});
    writeFileSync(join(manager.modelDirectory(), 'fixture.gguf'), 'fixture');
    const negativePrompt = 'text, logos; $(touch unintended-file) `touch another-file`';
    const generated = await manager.generate('Controlled background', 'fixture.gguf', { negativePrompt });
    const args = JSON.parse(readFileSync(join(root, 'image-generation/argv.json'), 'utf8'));
    assert.equal(args[args.indexOf('-n') + 1], negativePrompt);
    assert.equal(args[args.indexOf('--steps') + 1], '20');
    assert.equal(args[args.indexOf('--sampling-method') + 1], 'euler_a');
    assert.ok(existsSync(generated.path));
    assert.ok(!existsSync(join(root, 'image-generation/unintended-file')) && !existsSync(join(root, 'image-generation/another-file')));
    await manager.generate('Controlled background', 'fixture.gguf');
    assert.ok(!JSON.parse(readFileSync(join(root, 'image-generation/argv.json'), 'utf8')).includes('-n'));
  } finally { manager?.close(); rmSync(root, { recursive: true, force: true }); }
});

test('invalid negative prompts fail before preparing or downloading a model', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-image-negative-invalid-'));
  const manager = new LocalImageManager(root, () => {});
  try {
    manager.prepareModel = async () => { throw new Error('Unexpected model preparation'); };
    await assert.rejects(manager.generate('Background', 'fixture.gguf', { negativePrompt: 42 }), /Negative image prompt/);
    await assert.rejects(manager.generate('Background', 'fixture.gguf', { negativePrompt: 'x'.repeat(2001) }), /Negative image prompt/);
  } finally { manager.close(); rmSync(root, { recursive: true, force: true }); }
});
