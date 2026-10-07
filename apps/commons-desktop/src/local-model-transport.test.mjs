import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {requestLocalModel} from './local-model-transport.ts';

test('local inference tolerates buffered tool responses and still honors cancellation', async () => {
  const server = createServer(async (request,response) => {
    for await (const _ of request) {}
    response.writeHead(200); response.flushHeaders();
    if (request.url === '/stall') return;
    setTimeout(()=>response.end('{"message":{"content":"verified"},"done":true}\n'),30);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await requestLocalModel(origin+'/api/chat',{body:'{}',signal:AbortSignal.timeout(1000)});
    assert.match(await response.text(),/verified/);
    const stalled = await requestLocalModel(origin+'/stall',{body:'{}',signal:AbortSignal.timeout(30)});
    await assert.rejects(stalled.text());
    assert.throws(()=>requestLocalModel('https://example.org/api/chat',{body:'{}',signal:new AbortController().signal}),/loopback/);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
