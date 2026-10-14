import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZipFile } from 'yazl';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { readArchive } from './archive.ts';

test('ZIP inputs become readable files, including spaces and Unicode; archived symlinks are rejected and cleaned up', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-archive-'));
  try {
    const archive = new ZipFile();
    archive.addBuffer(Buffer.from('Workflow evidence'), 'A kit/café.md');
    archive.end();
    await pipeline(archive.outputStream, createWriteStream(join(root, 'kit.zip')));
    const manifest = await readArchive(join(root, 'kit.zip'));
    assert.deepEqual(manifest.files, [{ path: 'A kit/café.md', bytes: 17 }]);
    await readArchive(join(root, 'kit.zip'), join(root, 'output'));
    assert.equal(readFileSync(join(root, 'output', 'A kit/café.md'), 'utf8'), 'Workflow evidence');
    const linked = new ZipFile();
    linked.addBuffer(Buffer.from('/etc/passwd'), 'escape', { mode: 0o120777 });
    linked.end();
    await pipeline(linked.outputStream, createWriteStream(join(root, 'linked.zip')));
    await assert.rejects(readArchive(join(root, 'linked.zip'), join(root, 'denied')), /symlinks/);
    assert.equal(existsSync(join(root, 'denied')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
