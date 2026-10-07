import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localImageContext, withLocalImages } from './local-vision.ts';

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
    const original = [{ role: 'user', content: 'Inspect this\n\n## Canvas\nversion 1' }, { role: 'tool', content: 'real evidence' }, { role: 'user', content: 'Then verify' }];
    const sent = withLocalImages(original, 'Inspect this', vision.images);
    assert.deepEqual(sent[0].images, ['AQID']); assert.equal(sent[1].images, undefined); assert.equal(sent[2].images, undefined); assert.equal(original[0].images, undefined);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); rmSync(root, { recursive: true, force: true }); }
});
