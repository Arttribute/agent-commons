import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import Module, { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'tsup';
import { ZipFile } from 'yazl';

test('session folders, model inheritance, media overrides and disabled knowledge survive persistence independently', async () => {
  const root = mkdtempSync(join(tmpdir(), 'commons-context-'));
  const output = join(import.meta.dirname, '..', 'node_modules', '.cache', 'context-test');
  await build({ entry: { runtime: join(import.meta.dirname, 'runtime.ts') }, outDir: output, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', external: ['electron'], noExternal: ['@agent-commons/agent-core', '@agent-commons/desktop-contract'], silent: true });
  // Node tests run outside Electron, where require('electron') returns a binary path.
  const originalLoad = Module._load;
  let PrivateLocalRuntime;
  try {
    Module._load = function (id, ...args) {
      if (id === 'electron') return { safeStorage: { isEncryptionAvailable: () => false } };
      return originalLoad.call(this, id, ...args);
    };
    ({ PrivateLocalRuntime } = createRequire(import.meta.url)(join(output, 'runtime.cjs')));
  } finally { Module._load = originalLoad; }
  const requests = [];
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/tags') return response.end(JSON.stringify({ models: ['default-a', 'default-b', 'fixed-agent'].map((name) => ({ name })) }));
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    if (body.stream === false) return response.end(JSON.stringify({ message: { role: 'assistant', content: 'A saved conversation' } }));
    const last = body.messages.at(-1);
    const message = last.role === 'user' && last.content === 'List this folder'
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'cli_list_directory', arguments: {} } }] }
      : last.role === 'user' && last.content === 'Read the root-qualified selected path'
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'cli_read_file', arguments: { path: 'Two/Two.txt' } } }] }
      : last.role === 'user' && last.content.startsWith('Extract ')
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'extract_library_archive', arguments: { itemId: last.content.slice(8) } } }] }
      : last.role === 'user' && last.content.startsWith('Read ')
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_library_item', arguments: { itemId: last.content.slice(5) } } }] }
      : { role: 'assistant', content: last.role === 'tool' ? last.content : 'Hello' };
    response.end(JSON.stringify({ message, done: true }) + '\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let runtime = new PrivateLocalRuntime(join(root, 'profile'));
  try {
    runtime.updateSettings({ ollamaUrl: `http://127.0.0.1:${server.address().port}`, defaultModel: 'default-a' });
    const inherited = runtime.saveAgent({ name: 'Inherited', instructions: '', model: '' }).agents.at(-1).id;
    const fixed = runtime.saveAgent({ name: 'Fixed', instructions: '', model: 'fixed-agent', mediaModels: { voiceModel: 'kokoro-bella', transcriptionModel: 'Xenova/whisper-tiny' } }).agents.at(-1).id;
    await runtime.sendMessage({ agentId: fixed, prompt: 'Hello' });
    assert.equal(runtime.state().settings.defaultModel, 'default-a');
    await runtime.sendMessage({ agentId: inherited, prompt: 'Hello' });
    assert.equal(requests.filter((request) => request.stream).at(-1).model, 'default-a');
    runtime.updateSettings({ defaultModel: 'default-b' });
    await runtime.sendMessage({ agentId: inherited, prompt: 'Hello' });
    assert.equal(requests.filter((request) => request.stream).at(-1).model, 'default-b');
    await runtime.sendMessage({ agentId: fixed, prompt: 'Hello' });
    assert.equal(requests.filter((request) => request.stream).at(-1).model, 'fixed-agent');
    for (const name of ['One', 'Two']) { mkdirSync(join(root, name)); writeFileSync(join(root, name, `${name}.txt`), name); }
    const first = await runtime.sendMessage({ agentId: inherited, workspaceRoot: join(root, 'One'), knowledgeMode: 'off', webSearchEnabled: false, prompt: 'List this folder' });
    assert.match(first.response, /Directory: .*One/); assert.match(first.response, /One.txt/);
    const second = await runtime.sendMessage({ agentId: inherited, conversationId: first.conversation.id, workspaceRoot: join(root, 'Two'), prompt: 'List this folder' });
    assert.match(second.response, /Directory: .*Two/); assert.match(second.response, /Two.txt/); assert.doesNotMatch(second.response, /One.txt/);
    const tools = requests.filter((request) => request.stream).at(-1).tools.map((tool) => tool.function.name);
    assert.ok(!tools.includes('web_search')); assert.equal(second.conversation.webSearchEnabled, false);
    assert.ok(!tools.includes('search_knowledge')); assert.ok(!tools.includes('list_knowledge_spaces'));
    const qualified = await runtime.sendMessage({ agentId: inherited, conversationId: first.conversation.id, prompt: 'Read the root-qualified selected path' });
    assert.ok(qualified.conversation.messages.some((message) => message.toolName === 'cli_read_file' && message.content === 'Two'));
    const removed = await runtime.sendMessage({ agentId: inherited, conversationId: first.conversation.id, workspaceRoot: null, prompt: 'Hello' });
    assert.equal(removed.conversation.workspaceRoot, undefined);
    assert.ok(!requests.filter((request) => request.stream).at(-1).tools.some((tool) => tool.function.name.startsWith('cli_')));
    runtime.setTarget({ isDestroyed: () => false, send: (_channel, event) => { if (event.type === 'approval') queueMicrotask(() => runtime.resolveApproval(event.approval.id, true)); } });
    const zip = new ZipFile(); zip.addBuffer(Buffer.from('Approved workflow input'), 'A kit/START HERE.md'); zip.end();
    const chunks = []; for await (const chunk of zip.outputStream) chunks.push(chunk);
    runtime.importLibraryFiles([{ name: 'workflow.zip', mimeType: 'application/zip', bytes: new Uint8Array(Buffer.concat(chunks)) }]);
    const zipId = runtime.state().library.find((item) => item.name === 'workflow.zip').id;
    const extraction = await runtime.sendMessage({ agentId: inherited, attachmentIds: [zipId], workspaceRoot: null, prompt: `Extract ${zipId}` });
    assert.equal(extraction.conversation.artifacts.length, 1);
    const again = await runtime.sendMessage({ agentId: inherited, conversationId: extraction.conversation.id, prompt: `Extract ${zipId}` });
    assert.equal(again.conversation.artifacts.length, 1, 'Extraction duplicated the working files');
    const read = await runtime.sendMessage({ agentId: inherited, conversationId: extraction.conversation.id, prompt: 'Read START HERE.md' });
    assert.ok(read.conversation.messages.some((message) => message.toolName === 'read_library_item' && message.content.includes('Approved workflow input')), JSON.stringify(read.conversation.messages.slice(-3)));
    assert.equal(read.conversation.workspaceRoot, undefined);
    runtime.close();
    runtime = new PrivateLocalRuntime(join(root, 'profile'));
    assert.equal(runtime.state().settings.defaultModel, 'default-b');
    assert.equal(runtime.state().conversations.find((chat) => chat.id === first.conversation.id).webSearchEnabled, false);
    assert.equal(runtime.state().agents.find((agent) => agent.id === fixed).model, 'fixed-agent');
    assert.equal(runtime.state().agents.find((agent) => agent.id === fixed).mediaModels.voiceModel, 'kokoro-bella');
    assert.equal(runtime.state().conversations.find((chat) => chat.id === first.conversation.id).knowledgeMode, 'off');
    await assert.rejects(runtime.sendMessage({ agentId: inherited, workspaceRoot: join(root, 'missing'), prompt: 'Hello' }), /ENOENT/);
  } finally { runtime.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); rmSync(root, { recursive: true, force: true }); }
});
