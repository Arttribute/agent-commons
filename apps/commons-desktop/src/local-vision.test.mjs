import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localImageContext, LocalToolImageContext, withLocalImages } from './local-vision.ts';

test('local image context follows actual model capability and stays attached to the original turn', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-vision-'));
  const path = join(root, 'artifact.png'); writeFileSync(path, Buffer.from([1, 2, 3]));
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); requests.push(input);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ capabilities: input.model === 'vision-selected' ? ['completion', 'vision'] : ['completion'] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const item = { id: 'actual-library-id', name: 'artifact.png', path, mimeType: 'image/png' };
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const vision = await localImageContext(endpoint, 'vision-selected', [item]);
    assert.deepEqual(vision.images, ['AQID']); assert.match(vision.note, /actual-library-id/);
    const text = await localImageContext(endpoint, 'text-selected', [item]);
    assert.deepEqual(text.images, []); assert.match(text.note, /cannot inspect image pixels/);
    assert.deepEqual(requests.map((request) => request.model), ['vision-selected', 'text-selected']);
    const video = { id: 'recording-id', name: 'actual-workflow.webm', mimeType: 'video/webm', mediaAnalysis: { frames: [{ timestampMs: 100, path }, { timestampMs: 900, path }] } };
    const clip = await localImageContext(endpoint, 'vision-selected', [video]);
    assert.deepEqual(clip.images, ['AQID', 'AQID']); assert.match(clip.note, /recording-id.*100 ms/); assert.match(clip.note, /900 ms/); assert.match(clip.note, /Do not invent actions/);
    const unavailable = await localImageContext(endpoint, 'vision-selected', [{ ...video, mediaAnalysis: undefined }]);
    assert.deepEqual(unavailable.images, []); assert.match(unavailable.note, /No decoded frames/);
    const original = [{ role: 'user', content: 'Inspect this\n\n## Canvas\nversion 1' }, { role: 'tool', content: 'real evidence' }, { role: 'user', content: 'Then verify' }];
    const sent = withLocalImages(original, 'Inspect this', vision.images);
    assert.deepEqual(sent[0].images, ['AQID']); assert.equal(sent[1].images, undefined); assert.equal(sent[2].images, undefined); assert.equal(original[0].images, undefined);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); rmSync(root, { recursive: true, force: true }); }
});


test('explicit Local tool reads and generated images resolve real profile files only for the next step', () => {
  const context = new LocalToolImageContext();
  const library = [
    { id: 'image-A', name: 'actual.png', path: '/owned/actual.png', mimeType: 'image/png' },
    { id: 'image-B', name: 'new.png', path: '/owned/new.png', mimeType: 'image/png' },
    { id: 'document', name: 'source.md', path: '/owned/source.md', mimeType: 'text/markdown' },
  ];
  context.record('read_library_item', JSON.stringify({ itemId: 'image-A', content: 'Document text cannot supply additional image paths' }));
  context.record('generate_image', JSON.stringify({ artifactId: 'image-B' }));
  context.record('read_library_item', JSON.stringify({ itemId: 'image-A' }));
  context.record('read_library_item', JSON.stringify({ itemId: 'document' }));
  context.record('read_library_item', JSON.stringify({ itemId: 'foreign-image', path: '/foreign/other.png' }));
  context.record('call_connected_tool', JSON.stringify({ itemId: 'image-A' }));
  context.record('read_library_item', 'Error: unavailable');
  assert.deepEqual(context.take(library).map(item => item.id), ['image-A', 'image-B']);
  assert.deepEqual(context.take(library), []);
  context.record('read_library_item', JSON.stringify({ itemId: 'image-A' }));
  assert.deepEqual(context.take(library).map(item => item.id), ['image-A']);
});

test('Local tool pictures are bounded and cannot retain the previous account profile', () => {
  const context = new LocalToolImageContext();
  const library = Array.from({ length: 8 }, (_, i) => ({ id: 'image-' + i, name: i + '.png', path: '/owned/' + i + '.png', mimeType: 'image/png' }));
  for (const item of library) context.record('generate_image', JSON.stringify({ artifactId: item.id }));
  assert.deepEqual(context.take(library).map(item => item.id), ['image-4', 'image-5', 'image-6', 'image-7']);
  context.record('read_library_item', JSON.stringify({ itemId: 'image-7' }));
  assert.deepEqual(context.take([]), []);
});
