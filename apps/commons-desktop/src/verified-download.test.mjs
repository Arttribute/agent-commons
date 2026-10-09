import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { downloadVerified } from './verified-download.ts';

const bytes = Buffer.alloc(16_384, 71);
const sha = createHash('sha256').update(bytes).digest('hex');
async function fixture(handler, check) {
  const root = mkdtempSync(join(tmpdir(), 'commons-download-'));
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await check(`http://127.0.0.1:${server.address().port}/model`, join(root, 'model.download')); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); }
}

test('an interrupted download resumes at verified byte position and checks the whole file', async () => {
  const ranges = [];
  await fixture((req, res) => {
    ranges.push(req.headers.range);
    if (ranges.length === 1) {
      res.writeHead(200, { 'content-length': bytes.length });
      res.write(bytes.subarray(0, 8192));
      setTimeout(() => res.destroy(), 25);
    } else {
      assert.equal(req.headers.range, 'bytes=8192-');
      res.writeHead(206, { 'content-length': 8192, 'content-range': 'bytes 8192-16383/16384' });
      res.end(bytes.subarray(8192));
    }
  }, async (url, path) => {
    await downloadVerified(url, path, sha, () => {}, bytes.length);
    assert.ok(readFileSync(path).equals(bytes));
    assert.equal(ranges.length, 2);
  });
});

test('a server ignoring Range replaces partial bytes without appending duplicates', async () => {
  let calls = 0;
  await fixture((_req, res) => {
    res.writeHead(200, { 'content-length': bytes.length });
    if (++calls === 1) { res.write(bytes.subarray(0, 4096)); setTimeout(() => res.destroy(), 25); }
    else res.end(bytes);
  }, async (url, path) => {
    await downloadVerified(url, path, sha, () => {}, bytes.length);
    assert.ok(readFileSync(path).equals(bytes));
    assert.equal(calls, 2);
  });
});

test('checksum, size and invalid resume metadata failures remove temporary files', async () => {
  let calls = 0;
  await fixture((_req, res) => { calls++; res.writeHead(200, { 'content-length': bytes.length }); res.end(bytes); }, async (url, path) => {
    await assert.rejects(downloadVerified(url, path, '0'.repeat(64), () => {}, bytes.length), /checksum/);
    assert.equal(existsSync(path), false);
    await assert.rejects(downloadVerified(url, path, sha, () => {}, bytes.length - 1), /larger/);
    assert.equal(existsSync(path), false);
    assert.equal(calls, 2);
  });
  calls = 0;
  await fixture((_req, res) => {
    if (++calls === 1) { res.writeHead(200, { 'content-length': bytes.length }); res.write(bytes.subarray(0, 4096)); setTimeout(() => res.destroy(), 25); }
    else { res.writeHead(206, { 'content-range': 'bytes 0-16383/16384' }); res.end(bytes); }
  }, async (url, path) => {
    await assert.rejects(downloadVerified(url, path, sha, () => {}, bytes.length), /invalid resume/);
    assert.equal(existsSync(path), false);
  });
});

test('account cancellation stops the stream, avoids retry and removes partial bytes', async () => {
  let calls = 0;
  await fixture((_req, res) => { calls++; res.writeHead(200, { 'content-length': bytes.length }); res.write(bytes.subarray(0, 4096)); }, async (url, path) => {
    const owner = new AbortController();
    await assert.rejects(downloadVerified(url, path, sha, () => owner.abort(new Error('account switched')), bytes.length, owner.signal), /account switched/);
    assert.equal(existsSync(path), false);
    assert.equal(calls, 1);
  });
});
