import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'tsup';
import { spawnSync } from 'node:child_process';

// Exercise the real runtime with a controlled model-protocol failure. This
// verifies tool recovery and persistence, not the quality of any actual model.
const app = resolve(import.meta.dirname, '..');
const output = join(app, 'node_modules/.cache/tool-repair-reliability');
await build({ entry: { runtime: join(app, 'src/runtime.ts') }, outDir: output, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', external: ['electron'], noExternal: ['@agent-commons/agent-core', '@agent-commons/desktop-contract'], silent: true });
async function verifyRuntime(runtimePath) {
  const { PrivateLocalRuntime } = require(runtimePath);
  const directory = mkdtempSync(join(tmpdir(), 'commons-tool-repair-'));
  const models = ['qwen3.5:2b-q8_0', 'deepseek-r1:1.5b'];
  const malformed = '# Unsaved draft\n' + 'raw Markdown is not a files array\n'.repeat(220);
  const requests = new Map(models.map(model => [model, []]));
  const archiveRequests = new Map(models.map(model => [model, []]));
  const sourceRequests = new Map(models.map(model => [model, []]));
  let archiveId;
  let serverError;
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      response.setHeader('Content-Type', 'application/x-ndjson');
      if (request.url === '/api/tags') return response.end(JSON.stringify({ models: models.map(model => ({ name: model, model, details: { family: model.startsWith('qwen') ? 'qwen35' : 'deepseek', parameter_size: '2B', quantization_level: 'Q8_0' } })) }));
      if (request.url === '/api/show') return response.end(JSON.stringify({ capabilities: ['completion', 'tools', 'thinking'], details: { family: 'qwen35' } }));
      if (request.url !== '/api/chat') return response.end(JSON.stringify({ done: true }));
      const model = body.model;
      if (body.messages.some(m => m.role === 'user' && m.content.includes('Source mapping boundary'))) {
        const calls = sourceRequests.get(model); calls.push(body);
        const action = (name, args) => model.startsWith('deepseek')
          ? { role: 'assistant', content: JSON.stringify({ tool: name, args }) }
          : { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] };
        if (calls.length > 1 && calls.length < 4) {
          const hint = body.messages.findLast(m => m.role === 'system' && m.content.includes('Available Python input identifiers'));
          assert.ok(hint, 'Missing-input recovery lost the actual source identifiers');
          assert.ok(hint.content.includes('scope-source.json'));
          assert.ok(hint.content.includes('INPUT_FILES values are path strings'));
          assert.ok(!hint.content.includes('source-template.html') && !hint.content.includes('not-in-this-chat'));
          if (calls.length === 3) assert.ok(hint.content.includes('failed twice'), 'Repeat failure discarded the specific input repair');
        }
        const message = calls.length < 3 ? action('run_python', { code: 'open("missing-source.json")' })
          : calls.length === 3 ? action('write_library_files', { files: [{ name: 'source-repair.md', content: 'Input lookup repaired.' }] })
          : { role: 'assistant', content: model.startsWith('deepseek') ? JSON.stringify({ tool: 'final', args: { response: 'Saved source-repair.md.' } }) : 'Saved source-repair.md.' };
        assert.ok(calls.length <= 4);
        return response.end(JSON.stringify({ model, message, done: true }) + '\n');
      }
      if (body.messages.some(m => m.role === 'user' && m.content.includes('Archive completion boundary'))) {
        const calls = archiveRequests.get(model);
        calls.push(body);
        const names = body.tools?.map(tool => tool.function.name) ?? body.format.properties.tool.enum;
        const action = (name, args) => model.startsWith('deepseek')
          ? { role: 'assistant', content: JSON.stringify({ tool: name, args }) }
          : { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] };
        let message;
        if (calls.length === 1) {
          assert.ok(names.includes('extract_library_archive'), 'Another chat’s extracted members must not hide this chat’s extraction tool');
          message = action('extract_library_archive', { itemId: archiveId });
        } else if (calls.length === 2) {
          assert.ok(!names.includes('extract_library_archive'), 'Completed extraction is still offered to the model');
          assert.match(body.messages[0].content, /Current Library archive state/);
          assert.match(body.messages[0].content, /"extracted":true/);
          message = action('read_library_item', { itemId: 'kit/START HERE.md' });
        } else {
          assert.equal(calls.length, 3);
          assert.ok(body.messages.some(m => m.content.includes('File bodies live here.')));
          assert.ok(!names.includes('extract_library_archive'));
          message = { role: 'assistant', content: model.startsWith('deepseek') ? JSON.stringify({ tool: 'final', args: { response: 'Verified actual archive source.' } }) : 'Verified actual archive source.' };
        }
        return response.end(JSON.stringify({ model, message, done: true }) + '\n');
      }
      const calls = requests.get(model);
      assert.ok(calls, 'Unexpected fixture model');
      calls.push(body);
      let message;
      if (calls.length === 1) {
        message = model.startsWith('deepseek')
          ? { role: 'assistant', content: JSON.stringify({ tool: 'write_library_files', args: { files: malformed } }) }
          : { role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_library_files', arguments: { files: malformed } } }] };
      } else if (calls.length === 2) {
        assert.equal(body.format.properties.files.type, 'array', 'Repair did not enforce the offered argument schema');
        assert.ok(!body.tools, 'Repair still offered unrelated tool calls');
        assert.ok(body.messages.some(m => m.content.includes('files must be an array')));
        message = { role: 'assistant', content: JSON.stringify({ files: [{ name: 'report.md', content: 'Schema repair verified.' }] }) };
      } else {
        assert.equal(calls.length, 3, 'Unexpected continuation after verified output');
        message = { role: 'assistant', content: model.startsWith('deepseek') ? JSON.stringify({ tool: 'final', args: { response: 'Saved report.md.' } }) : 'Saved report.md.' };
      }
      response.end(JSON.stringify({ model, message, done: true }) + '\n');
    } catch (error) {
      serverError = error;
      response.statusCode = 500;
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let runtime;
  try {
    runtime = new PrivateLocalRuntime(directory);
    runtime.updateSettings({ ollamaUrl: `http://127.0.0.1:${server.address().port}`, defaultModel: models[0] });
    runtime.setTarget({ isDestroyed: () => false, send: (_channel, event) => {
      if (event.type === 'approval') queueMicrotask(() => runtime.resolveApproval(event.approval.id, true));
    } });
    const templateText = '<!doctype html><title>Source template</title>\n' + '<p>Exact source template bytes.</p>\n'.repeat(1500);
    const [template, foreign] = runtime.importLibraryFiles([
      { name: 'source-template.html', mimeType: 'text/html', bytes: new TextEncoder().encode(templateText) },
      { name: 'START guide not-in-this-chat.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode('Other Library file') },
    ]);
    const [archive] = runtime.importLibraryFiles([{ name: 'sources.zip', mimeType: 'application/zip', bytes: new Uint8Array(Buffer.from('UEsDBBQAAAAIABu4SV3Vvl/PMQAAAC8AAAARAAAAa2l0L1NUQVJUIEhFUkUubWRzy8xJVUjKT8lMLVbIySxLVchILUrVUwhKTUxRKMnILFZITC4pTcxRKM4vLUpO1QMAUEsDBBQAAAAIABu4SV1pNMixTQAAAFEAAAATAAAAa2l0L1NUQVJUIEhFUkUuaHRtbLNRTMlPLqksSFXIKMnNsbMpLqnMSbVLyk+pVKhWSM7PyS+yUkjKSUzOtlaotdGHyNpkGNoFpxYkFiWWpCp4hPj6KBTnlxYlp9roAyUAUEsDBBQAAAAIABu4SV1fcMvZLQAAAC8AAAAWAAAAa2l0L3RlbXBsYXRlL3ZpZXcuaHRtbLNRTMlPLqksSFXIKMnNsbMpySzJSbULLi0oyMlMTVEoSc0tyEksSbXRh0gAAFBLAQIUAxQAAAAIABu4SV3Vvl/PMQAAAC8AAAARAAAAAAAAAAAAAACAAQAAAABraXQvU1RBUlQgSEVSRS5tZFBLAQIUAxQAAAAIABu4SV1pNMixTQAAAFEAAAATAAAAAAAAAAAAAACAAWAAAABraXQvU1RBUlQgSEVSRS5odG1sUEsBAhQDFAAAAAgAG7hJXV9wy9ktAAAALwAAABYAAAAAAAAAAAAAAIAB3gAAAGtpdC90ZW1wbGF0ZS92aWV3Lmh0bWxQSwUGAAAAAAMAAwDEAAAAPwEAAAAA', 'base64')) }]);
    archiveId = archive.id;
    for (const model of models) {
      const agent = runtime.saveAgent({ name: 'Controlled tool recovery', model, instructions: 'Save requested files using the available Library tool.' }).agents.at(-1);
      const result = await runtime.sendMessage({ agentId: agent.id, workspaceRoot: null, knowledgeMode: 'off', webSearchEnabled: false, attachmentIds: [template.id, archive.id], prompt: 'Save report.md containing Schema repair verified. Return its actual saved Library output.' });
      if (serverError) throw serverError;
      const artifact = result.conversation.artifacts.find(a => a.name === 'report.md');
      assert.ok(artifact);
      assert.equal(readFileSync(artifact.path, 'utf8'), 'Schema repair verified.');
      const writes = result.conversation.messages.filter(m => m.toolName === 'write_library_files');
      assert.equal(writes.length, 2);
      assert.ok(writes[0].content.startsWith('Error:'));
      assert.equal(writes[0].toolArgs.files, malformed, 'Stored failed arguments changed');
      assert.ok(!writes[1].content.startsWith('Error:'));
      assert.equal(requests.get(model).length, 3);
      const copied = JSON.parse(await runtime.executeDataTool('copy_library_file', { itemId: template.id, name: 'templates/copied.html' }, result.conversation.id));
      assert.equal(copied.copiedFrom.itemId, template.id);
      const copy = runtime.state().library.find(item => item.id === copied.artifacts[0].itemId);
      assert.equal(readFileSync(copy.path, 'utf8'), templateText);
      assert.equal(readFileSync(template.path, 'utf8'), templateText);
      const forbidden = await runtime.executeDataTool('copy_library_file', { itemId: foreign.id, name: 'foreign.txt' }, result.conversation.id);
      assert.match(forbidden, /^Error: Source file is not available/);
      const escaped = await runtime.executeDataTool('copy_library_file', { itemId: template.id, name: '../outside.html' }, result.conversation.id);
      assert.match(escaped, /^Error: Use relative filenames/);
      const inventory = JSON.parse(await runtime.executeTool('read_library_item', { itemId: archive.id, offset: 9994 }, undefined, result.conversation.id));
      assert.equal(inventory.readMode, 'archive_inventory');
      assert.equal(inventory.memberContentsReturned, false);
      assert.equal(inventory.content, undefined);
      assert.equal(inventory.nextOffset, undefined);
      assert.ok(!JSON.stringify(inventory).includes('File bodies live here.'));
      const extracted = JSON.parse(await runtime.executeDataTool('extract_library_archive', { itemId: archive.id }, result.conversation.id));
      assert.equal(extracted.alreadyExtracted, false);
      const reused = JSON.parse(await runtime.executeDataTool('extract_library_archive', { itemId: archive.id }, result.conversation.id));
      assert.equal(reused.alreadyExtracted, true);
      assert.equal(reused.directory, extracted.directory);
      assert.deepEqual(reused.files, extracted.files);
      const sourceLookup = JSON.parse(await runtime.executeTool('search_library_item', { itemId: archive.id, query: 'START HERE' }, undefined, result.conversation.id));
      assert.equal(sourceLookup.extracted, true);
      const member = sourceLookup.files.find(file => file.path === 'kit/START HERE.md');
      assert.ok(member?.itemId);
      const descriptiveSearch = JSON.parse(await runtime.executeTool('search_library_item', { itemId: archive.id, query: 'START guide' }, undefined, result.conversation.id));
      assert.equal(descriptiveSearch.matchingMembers, 0);
      assert.deepEqual(descriptiveSearch.files, []);
      assert.equal(descriptiveSearch.suggestions[0].itemId, member.itemId);
      assert.ok(!JSON.stringify(descriptiveSearch).includes('File bodies live here.'), 'Filename suggestions must not imply document content retrieval');
      const descriptiveList = JSON.parse(await runtime.executeTool('list_session_files', { query: 'START guide' }, undefined, result.conversation.id));
      assert.equal(descriptiveList.totalFiles, 0);
      assert.equal(descriptiveList.suggestions[0].itemId, member.itemId);
      assert.ok(!JSON.stringify(descriptiveList).includes(foreign.id), 'A matching foreign filename must not enter chat-scoped suggestions');
      const actualSource = JSON.parse(await runtime.executeTool('read_library_item', { itemId: member.itemId }, undefined, result.conversation.id));
      assert.ok(actualSource.content.includes('File bodies live here.'));
      assert.equal(actualSource.endOfText, true);
      assert.equal(actualSource.readStatus, 'final_chunk');
      const eof = JSON.parse(await runtime.executeTool('read_library_item', { itemId: member.itemId, offset: actualSource.totalChars }, undefined, result.conversation.id));
      assert.equal(eof.content, '');
      assert.equal(eof.readStatus, 'end_of_text');
      assert.match(eof.hint, /There is no next chunk/);
      const htmlRead = JSON.parse(await runtime.executeTool('read_library_item', { itemId: 'kit/START HERE.html' }, undefined, result.conversation.id));
      assert.equal(htmlRead.name, 'kit/START HERE.html');
      assert.ok(htmlRead.content.includes('Separate HTML source'));
      assert.ok(!htmlRead.content.includes('File bodies live here.'));
      assert.equal(htmlRead.availableMarkdownSource.itemId, member.itemId);
      const directorySearch = await runtime.executeTool('search_library_item', { itemId: 'kit', query: 'START HERE' }, undefined, result.conversation.id);
      assert.match(directorySearch, /^Error: That path identifies a directory/);
      assert.ok(directorySearch.includes(member.itemId) && directorySearch.includes('read_library_item'));
      assert.ok(!directorySearch.includes('File bodies live here.'), 'Directory guidance must not pretend filenames are document contents');
      assert.ok(!directorySearch.includes(foreign.id) && !directorySearch.includes(foreign.name), 'Directory guidance must respect the captured chat scope');
      const directoryRead = await runtime.executeTool('read_library_item', { itemId: 'kit/template' }, undefined, result.conversation.id);
      assert.match(directoryRead, /^Error: That path identifies a directory/);
      assert.ok(directoryRead.includes('kit/template/view.html'));
      const missingDirectory = await runtime.executeTool('search_library_item', { itemId: 'unattached-folder', query: 'START HERE' }, undefined, result.conversation.id);
      assert.match(missingDirectory, /^Error: that file is not attached/);
      assert.ok(!missingDirectory.includes(member.itemId), 'Unknown folders must not disclose a current file inventory');
      runtime.updateSettings({ permissionMode: 'read-only' });
      const readOnly = await runtime.executeDataTool('copy_library_file', { itemId: template.id, name: 'readonly.html' }, result.conversation.id);
      assert.match(readOnly, /^Error: This chat is read only/);
      runtime.updateSettings({ permissionMode: 'ask' });
      const archiveResult = await runtime.sendMessage({ agentId: agent.id, workspaceRoot: null, knowledgeMode: 'off', webSearchEnabled: false, attachmentIds: [archive.id], prompt: 'Archive completion boundary: extract the attached ZIP once and read its actual START source. Report the verified source.' });
      if (serverError) throw serverError;
      assert.equal(archiveRequests.get(model).length, 3);
      assert.equal(archiveResult.conversation.messages.filter(m => m.toolName === 'extract_library_archive').length, 1);
      const completed = runtime.libraryArchiveState(archiveResult.conversation.id, new Set());
      assert.equal(completed[0].extracted, true);
      const memberFile = runtime.state().library.find(item => item.sourceArchiveId === archive.id && archiveResult.conversation.artifacts.some(a => a.id === item.id));
      const originalBytes = readFileSync(memberFile.path);
      rmSync(memberFile.path);
      assert.equal(runtime.libraryArchiveState(archiveResult.conversation.id, new Set())[0].extracted, false, 'Missing member bytes must re-enable extraction');
      writeFileSync(memberFile.path, originalBytes);
      const [source] = runtime.importLibraryFiles([{ name: 'scope-source.json', mimeType: 'application/json', bytes: new TextEncoder().encode('{"source":"current chat"}') }]);
      const originalDataTool = runtime.executeDataTool.bind(runtime);
      // Inject two controlled Python path failures; exercise the real recovery
      // context and persistence without installing an interpreter in this test.
      runtime.executeDataTool = async (name, ...args) => name === 'run_python'
        ? 'Error: Python execution failed. FileNotFoundError: missing-source.json'
        : originalDataTool(name, ...args);
      try {
        const repaired = await runtime.sendMessage({ agentId: agent.id, workspaceRoot: null, knowledgeMode: 'off', webSearchEnabled: false, attachmentIds: [source.id], prompt: 'Source mapping boundary: save source-repair.md containing Input lookup repaired. Use the attached scope-source.json; do not use other Library files.' });
        if (serverError) throw serverError;
        assert.equal(sourceRequests.get(model).length, 4);
        assert.equal(readFileSync(repaired.conversation.artifacts.find(file => file.name === 'source-repair.md').path, 'utf8'), 'Input lookup repaired.');
      } finally { runtime.executeDataTool = originalDataTool; }
    }
    console.log(`Local malformed-write recovery passed on ${process.platform}-${process.arch}; original diagnostics, saved bytes, archive/member distinction and scoped template copies verified.`);
  } finally {
    runtime?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }

}

// Use the actual Electron process so safeStorage and account persistence behave
// identically on Linux, Windows and macOS, without replacing Electron APIs.
const worker = join(output, 'verify.cjs');
writeFileSync(worker, `const { app } = require('electron');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
${verifyRuntime.toString()}
app.whenReady().then(() => verifyRuntime(${JSON.stringify(join(output, 'runtime.cjs'))})).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
`);
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const result = spawnSync(createRequire(import.meta.url)('electron'), [worker], { env: environment, encoding: 'utf8', timeout: 120_000 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
assert.equal(result.status, 0, 'Electron runtime tool recovery failed');
