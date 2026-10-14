import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeLibraryFiles } from './library-file-writer.ts';

test('Library documents persist for later steps and revisions keep relative dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-library-writer-'));
  try {
    const output = join(root, 'outputs');
    const first = writeLibraryFiles(output, join(root, 'run-1/snapshot'), [{ name: 'brand-sheet.md', content: 'Approved price: USD 49/month' }, { name: 'assets/style.css', content: 'body { color: green; }' }]);
    const second = writeLibraryFiles(output, join(root, 'run-2/snapshot'), [{ name: 'index.html', content: '<link href="assets/style.css" rel="stylesheet">' }]);
    writeLibraryFiles(output, join(root, 'run-3/snapshot'), [{ name: 'brand-sheet.md', content: 'Updated draft' }]);
    assert.equal(readFileSync(first[0].path, 'utf8'), 'Approved price: USD 49/month');
    assert.equal(readFileSync(join(output, 'brand-sheet.md'), 'utf8'), 'Updated draft');
    assert.equal(readFileSync(join(root, 'run-2/snapshot/assets/style.css'), 'utf8'), 'body { color: green; }');
    assert.equal(readFileSync(second[0].path, 'utf8'), '<link href="assets/style.css" rel="stylesheet">');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects invalid batches and paths before changing existing files', () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-library-writer-boundary-'));
  try {
    const output = join(root, 'outputs');
    writeLibraryFiles(output, join(root, 'initial/snapshot'), [{ name: 'draft.md', content: 'Original draft' }]);
    for (const name of ['../escape.txt', '/outside.txt', 'C:/outside.txt', 'fake.png', 'draft.md/child.txt']) {
      assert.throws(() => writeLibraryFiles(output, join(root, 'invalid/snapshot'), [{ name: 'draft.md', content: 'Replacement' }, { name, content: 'Invalid second file' }]));
      assert.equal(readFileSync(join(output, 'draft.md'), 'utf8'), 'Original draft');
    }
    const outside = join(root, 'outside.txt'); writeFileSync(outside, 'External file');
    symlinkSync(outside, join(output, 'alias.txt'));
    assert.throws(() => writeLibraryFiles(output, join(root, 'symlink/snapshot'), [{ name: 'alias.txt', content: 'Changed' }]), /symbolic link/);
    assert.equal(readFileSync(outside, 'utf8'), 'External file');
    assert.throws(() => writeLibraryFiles(output, join(root, 'invalid-json/snapshot'), [{ name: 'draft.md', content: 'Replacement' }, { name: 'means.json', content: '{"mean":NaN}' }]), /Invalid JSON/);
    assert.equal(readFileSync(join(output, 'draft.md'), 'utf8'), 'Original draft');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
