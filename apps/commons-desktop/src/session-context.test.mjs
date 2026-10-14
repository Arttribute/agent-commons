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
  let canvasProjectId;
  let unrelatedCanvasId;
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/tags') return response.end(JSON.stringify({ models: ['default-a', 'default-b', 'fixed-agent'].map((name) => ({ name })) }));
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    if (body.stream === false) return response.end(JSON.stringify({ message: { role: 'assistant', content: 'A saved conversation' } }));
    const last = body.messages.at(-1);
    if (body.messages.some((entry) => entry.role === 'user' && entry.content === 'Use run_python to calculate and save the report')) {
      const message = last.role === 'user' ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'run_python', arguments: { code: '' } } }] } : { role: 'assistant', content: 'I successfully generated and saved the report.' };
      return response.end(JSON.stringify({ message, done: true }) + '\n');
    }
    const message = last.role === 'user' && last.content === 'List this folder'
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'cli_list_directory', arguments: {} } }] }
      : last.role === 'user' && last.content === 'Read the root-qualified selected path'
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'cli_read_file', arguments: { path: 'Two/Two.txt' } } }] }
      : last.role === 'user' && last.content.startsWith('Extract ')
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'extract_library_archive', arguments: { itemId: last.content.slice(8) } } }] }
      : last.role === 'user' && last.content === 'List the START reference'
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'list_session_files', arguments: { query: 'start-here' } } }] }
      : last.role === 'user' && last.content.startsWith('Inspect persisted canvas')
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_canvas', arguments: { projectId: canvasProjectId } } }] }
      : last.role === 'user' && last.content.startsWith('Inspect unrelated canvas')
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_canvas', arguments: { projectId: unrelatedCanvasId } } }] }
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
    assert.ok(requests.every((request) => request.stream === true), 'Background title inference competes with active local turns');
    assert.ok(runtime.state().conversations.every((conversation) => conversation.title !== 'New chat'));
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
    await assert.rejects(runtime.sendMessage({ agentId: inherited, prompt: 'Use run_python to calculate and save the report', workspaceRoot: null, knowledgeMode: 'off' }), /claimed completion without successful code/);
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
    const reference = await runtime.sendMessage({ agentId: inherited, conversationId: extraction.conversation.id, prompt: 'List the START reference' });
    const manifest = JSON.parse(reference.response);
    assert.equal(manifest.files[0].name, 'A kit/START HERE.md');
    assert.equal(manifest.files[0].role, 'archive-reference');
    const referencePrompt = requests.filter((request) => request.stream).at(-1).messages[0].content;
    assert.match(referencePrompt, /Archive reference files/);
    assert.doesNotMatch(referencePrompt, /Generated outputs from this chat/);
    const recording = runtime.importLibraryFiles([{ name: 'Recording.wav', mimeType: 'audio/wav', bytes: Buffer.from('test binary recording') }])[0];
    assert.match((await runtime.readLibraryItem(recording.id)).content, /binary/);
    runtime.updateLibraryItem(recording.id, { mediaAnalysis: { durationMs: 3000, transcript: { segments: [{ startMs: 1234, endMs: 2500, text: 'Exact spoken phrase' }] } } });
    assert.match((await runtime.readLibraryItem(recording.id)).content, /\[1234-2500 ms\] Exact spoken phrase/);
    const [report, revised, unrelated] = runtime.importLibraryFiles([
      { name: 'Report.txt', mimeType: 'text/plain', bytes: Buffer.from('Revenue increased by 12%. This is the original report.') },
      { name: 'Report revised.txt', mimeType: 'text/plain', bytes: Buffer.from('Revenue increased by 15%. This is the revised report.') },
      { name: 'Other.txt', mimeType: 'text/plain', bytes: Buffer.from('Unrelated private canvas') },
    ]);
    const canvas = runtime.canvas.open(report.id);
    canvasProjectId = canvas.project.projectId;
    unrelatedCanvasId = runtime.canvas.open(unrelated.id).project.projectId;
    const revisionId = canvas.revisions[0].revisionId;
    const notes = [
      { kind: 'comment', body: 'Check the percentage', metadata: { target: { type: 'text', quote: 'Revenue increased by 12%.', page: 3, prefix: 'Summary: ', suffix: ' Next paragraph.', start: 50, end: 74 } } },
      { kind: 'comment', body: 'Check totals', metadata: { target: { type: 'cells', sheet: 'Sales', range: 'B2:C3', values: [['120', '80'], ['150', '90']] } } },
      { kind: 'comment', body: 'Fix code', metadata: { target: { type: 'source', file: 'src/chart.py', lineStart: 12, lineEnd: 14, code: 'total = df.amount.sum()' } } },
      { kind: 'region', body: 'This corner', geometry: { x: .25, y: .5, width: .2, height: .1 }, metadata: { target: { type: 'region', page: 3, quote: 'Legend' }, intrinsicSize: { width: 1000, height: 800 } } },
      { kind: 'time_range', body: 'Shorten this', startMs: 1234, endMs: 2500, metadata: { target: { type: 'time', transcript: 'Actual spoken words' } } },
    ].map((note) => runtime.canvas.createNote(canvasProjectId, { ...note, revisionId }));
    runtime.canvas.addVersion(canvasProjectId, revised.id, 'Corrected report');
    const uiContext = { resourceType: 'canvas', resourceId: canvasProjectId, canvasRevisionId: revisionId, annotationIds: notes.map((note) => note.annotationId), canvasViewer: { view: 'source', sourceFile: 'src/chart.py', page: 3, pageCount: 5, sheet: 'Sales', timeMs: 1234 } };
    assert.ok(runtime.canvasModelCatalog().models.every((model) => model.provider === 'local' && model.pricing.usd === 0 && model.modelKey.startsWith('local:')));
    runtime.canvas.patch(canvasProjectId, { settings: { creativeDefaults: { image: { modelKey: 'local:image:tiny-sd-q4.gguf' }, audio: { modelKey: 'local:voice:kokoro-bella' } } } });
    const inspected = await runtime.sendMessage({ agentId: inherited, prompt: 'Inspect persisted canvas', uiContext, workspaceRoot: null });
    const user = inspected.conversation.messages.find((message) => message.role === 'user');
    assert.ok(user.attachments.some((attachment) => attachment.id === report.id), 'Snapshot attached a later revision instead of the viewed original');
    assert.equal(user.canvasProjectId, canvasProjectId);
    assert.deepEqual(user.canvasMediaModels, { imageModel: 'tiny-sd-q4.gguf', voiceModel: 'kokoro-bella' });
    assert.equal(user.canvasAnnotations[0].metadata.canvasItemId, report.id);
    for (const exact of ['Revenue increased by 12%.', 'sheet "Sales", cells B2:C3', '120 | 80', 'src/chart.py lines 12-14', 'pixels 250,400 to 450,480 of 1000x800', '0:01.2-0:02.5', 'Actual spoken words', 'Showing version 1 of 2']) assert.ok(user.canvasContext.includes(exact), exact);
    const sent = requests.filter((request) => request.stream).at(-1);
    assert.ok(sent.messages.some((message) => message.content.includes('Revenue increased by 12%.') && message.content.includes('B2:C3')));
    const canvasRead = JSON.parse(inspected.conversation.messages.find((message) => message.toolName === 'read_canvas').content);
    assert.equal(canvasRead.project.activeItemId, report.id);
    assert.equal(canvasRead.savedActiveItemId, revised.id);
    assert.equal(canvasRead.viewedRevisionId, revisionId);
    assert.equal(canvasRead.turnContext, user.canvasContext);
    assert.deepEqual(canvasRead.attachedNotes, JSON.parse(JSON.stringify(user.canvasAnnotations)));
    assert.ok(JSON.stringify(canvasRead).includes('Check totals'));
    runtime.canvas.updateNote(canvasProjectId, notes[0].annotationId, { body: 'Edited after turn', status: 'resolved' });
    assert.ok(runtime.state().conversations.find((entry) => entry.id === inspected.conversation.id).messages[0].canvasContext.includes('Check the percentage'), 'Editing a note mutated an earlier turn');
    const refused = await runtime.sendMessage({ agentId: inherited, prompt: 'Inspect unrelated canvas', uiContext, workspaceRoot: null });
    assert.ok(refused.conversation.messages.some((message) => message.toolName === 'read_canvas' && /not attached to the current turn/.test(message.content)));
    await assert.rejects(runtime.sendMessage({ agentId: inherited, prompt: 'Hello', uiContext: { ...uiContext, canvasRevisionId: runtime.canvas.get(unrelatedCanvasId).revisions[0].revisionId } }), /Viewed revision/);
    assert.throws(() => runtime.canvas.createNote(canvasProjectId, { kind: 'region', body: 'Invalid box', revisionId, geometry: { x: 1.1, y: 0 } }), /normalized/);
    assert.throws(() => runtime.canvas.updateNote(unrelatedCanvasId, notes[0].annotationId, { status: 'resolved' }), /does not belong/);
    const greeting = await runtime.sendMessage({ agentId: inherited, prompt: 'Hello!', workspaceRoot: null, knowledgeMode: 'off' });
    const greetingRequest = requests.filter((request) => request.stream).at(-1);
    assert.equal(greetingRequest.tools, undefined, 'Opening greetings should not evaluate tool schemas');
    assert.equal(greetingRequest.options.num_ctx, 16384, 'Warm and foreground requests must use the same context allocation');
    assert.equal(greetingRequest.keep_alive, '5m');
    assert.ok(greetingRequest.messages[0].content.length < 3000);
    await runtime.sendMessage({ agentId: inherited, conversationId: greeting.conversation.id, prompt: 'List this folder', workspaceRoot: join(root, 'One') });
    const taskRequest = requests.filter((request) => request.stream).at(-1);
    assert.ok(taskRequest.tools.some((tool) => tool.function.name === 'cli_list_directory'), 'The next task must restore its normal tool harness');
    assert.match(taskRequest.messages[0].content, /Current selected-folder snapshot/);
    await runtime.sendMessage({ agentId: inherited, prompt: 'Hello!', attachmentIds: [report.id], knowledgeMode: 'off' });
    const contextualGreeting = requests.filter((request) => request.stream).at(-1);
    assert.ok(contextualGreeting.tools?.length, 'An attached greeting must retain the full context');
    assert.match(contextualGreeting.messages[0].content, /Revenue increased by 12%/);
    runtime.close();
    runtime = new PrivateLocalRuntime(join(root, 'profile'));
    assert.equal(runtime.state().settings.defaultModel, 'default-b');
    assert.equal(runtime.canvas.get(canvasProjectId).annotations.length, 5);
    assert.equal(runtime.canvas.get(canvasProjectId).annotations[0].body, 'Edited after turn');
    assert.equal(runtime.canvas.get(canvasProjectId).annotations[0].status, 'resolved');
    assert.equal(runtime.canvas.get(canvasProjectId).project.activeItemId, revised.id);
    runtime.canvas.updateNote(canvasProjectId, notes[1].annotationId, { deleted: true });
    assert.equal(runtime.canvas.get(canvasProjectId).annotations.length, 4);
    runtime.deleteLibraryItem(revised.id);
    assert.equal(runtime.canvas.get(canvasProjectId).project.activeItemId, report.id);
    assert.equal(runtime.canvas.get(canvasProjectId).revisions.length, 1);
    assert.equal(runtime.state().conversations.find((chat) => chat.id === first.conversation.id).webSearchEnabled, false);
    assert.equal(runtime.state().agents.find((agent) => agent.id === fixed).model, 'fixed-agent');
    assert.equal(runtime.state().agents.find((agent) => agent.id === fixed).mediaModels.voiceModel, 'kokoro-bella');
    assert.equal(runtime.state().conversations.find((chat) => chat.id === first.conversation.id).knowledgeMode, 'off');
    await assert.rejects(runtime.sendMessage({ agentId: inherited, workspaceRoot: join(root, 'missing'), prompt: 'Hello' }), /ENOENT/);
  } finally { runtime.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); rmSync(root, { recursive: true, force: true }); }
});
