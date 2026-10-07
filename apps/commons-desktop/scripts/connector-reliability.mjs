import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { build } from 'tsup';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const require = createRequire(import.meta.url);
const z = createRequire(require.resolve('@modelcontextprotocol/sdk/server/mcp.js'))('zod');
const app = resolve(import.meta.dirname, '..');
const buildDir = join(app, 'node_modules/.cache/connector-reliability');
await build({ entry: { runtime: join(app, 'src/runtime.ts') }, outDir: buildDir, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', external: ['electron'], noExternal: ['@agent-commons/agent-core', '@agent-commons/desktop-contract'], silent: true });
const { PrivateLocalRuntime } = require(join(buildDir, 'runtime.cjs'));
const root = mkdtempSync(join(tmpdir(), 'commons-connector-reliability-'));
const runtime = new PrivateLocalRuntime(root);
const calls = [];
const results = [];
runtime.setTarget({ isDestroyed: () => false, send: (_channel, event) => {
  if (event.type === 'approval') queueMicrotask(() => runtime.resolveApproval(event.approval.id, true));
} });
const models = process.env.COMMONS_SESSION_MODELS?.split(',') ?? ['qwen3.5:2b', 'qwen3:1.7b', 'deepseek-r1:1.5b', 'gemma4-e2b-unsloth:latest'];
try {
  for (const model of models) {
    const crm = new McpServer({ name: 'Fixture CRM', version: '1.0.0' });
    crm.registerTool('search_contacts', { description: 'Search CRM contacts by email or name', inputSchema: { query: z.string() }, annotations: { readOnlyHint: true } }, async ({ query }) => {
      calls.push({ model, tool: 'search_contacts', query });
      return { content: [{ type: 'text', text: JSON.stringify({ contacts: [{ id: 'contact-731', email: 'amina@example.invalid', name: 'Amina' }] }) }] };
    });
    crm.registerTool('create_contact_note', { description: 'Save a note against a CRM contact', inputSchema: { contactId: z.string(), note: z.string() }, annotations: { readOnlyHint: false } }, async (args) => {
      assert.equal(args.contactId, 'contact-731'); assert.match(args.note, /workflow complete/i);
      calls.push({ model, tool: 'create_contact_note', ...args });
      return { content: [{ type: 'text', text: JSON.stringify({ noteId: 'note-842', saved: true }) }] };
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
    await crm.connect(transport);
    const server = createServer((request, response) => {
      if (request.headers.authorization !== 'Bearer sandbox-token') { response.writeHead(401); response.end(); return; }
      void transport.handleRequest(request, response).catch((error) => { response.writeHead(500); response.end(error.message); });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const firstCall = calls.length; const started = Date.now();
    try {
      runtime.updateSettings({ mcpServers: [{ id: 'fixture-crm', name: 'Fixture CRM', url: `http://127.0.0.1:${server.address().port}/mcp`, apiKey: 'sandbox-token', mode: 'write', enabled: true }] });
      const agentId = runtime.saveAgent({ name: `Connector ${model}`, model, instructions: 'Execute requests with the connected tools and verify their results.' }).agents.at(-1).id;
      const result = await runtime.sendMessage({ agentId, workspaceRoot: null, knowledgeMode: 'off', webSearchEnabled: false, mcpServerIds: ['fixture-crm'], prompt: 'Use the connected Fixture CRM to find amina@example.invalid, then add the note "Workflow complete" to the contact you find. Complete both steps and report the returned note ID.' });
      const executed = calls.slice(firstCall);
      assert.ok(executed.some((call) => call.tool === 'search_contacts'));
      assert.ok(executed.some((call) => call.tool === 'create_contact_note'));
      assert.equal(result.conversation.mcpServerIds[0], 'fixture-crm');
      results.push({ model, passed: true, seconds: (Date.now() - started) / 1000, executed, response: result.response });
    } catch (error) { results.push({ model, passed: false, seconds: (Date.now() - started) / 1000, error: error.message, executed: calls.slice(firstCall) }); }
    finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await crm.close(); }
    console.log(JSON.stringify(results.at(-1)));
    writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2));
  }
} finally { runtime.close(); console.log(`Connector verification files: ${root}`); }
if (results.some((result) => !result.passed)) process.exitCode = 1;
