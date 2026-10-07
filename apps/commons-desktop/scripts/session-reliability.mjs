import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'tsup';

// Exercises the actual Desktop runtime, persistence, tools and installed models.
// Model responses are judged by tool execution and output files, not wording.
const app = resolve(import.meta.dirname, '..');
const buildDir = join(app, 'node_modules', '.cache', 'session-reliability');
await build({ entry: { runtime: join(app, 'src/runtime.ts') }, outDir: buildDir, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', external: ['electron'], noExternal: ['@agent-commons/agent-core', '@agent-commons/desktop-contract'], silent: true });
const require = createRequire(import.meta.url);
const { PrivateLocalRuntime } = require(join(buildDir, 'runtime.cjs'));
const root = process.env.COMMONS_SESSION_TEST_ROOT || mkdtempSync(join(tmpdir(), 'commons-session-reliability-'));
mkdirSync(root, { recursive: true });
const a = join(root, 'Folder A');
const b = join(root, 'Folder B');
mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
writeFileSync(join(a, 'folder-a.txt'), 'Selected folder A. Code: mango-731.');
writeFileSync(join(b, 'folder-b.txt'), 'Selected folder B. Code: papaya-842.');
const runtime = new PrivateLocalRuntime(join(root, 'profile'));
const events = [];
runtime.setTarget({ isDestroyed: () => false, send: (_channel, event) => {
  if (event.type === 'approval') queueMicrotask(() => runtime.resolveApproval(event.approval.id, true));
  if (event.type === 'activity' && event.toolName) { events.push(event); if (event.status === 'running') console.log(`Executing ${event.toolName}`); }
} });
const results = [];
const csv = runtime.importLibraryFiles([{ name: 'heart_rate.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('T1,T2,T3,T4\n60,70,80,90\n62,72,82,92\n64,74,84,94\n66,76,86,96\n68,78,88,98\n') }]);
const fileId = runtime.state().library.find((file) => file.name === 'heart_rate.csv').id;
const models = process.env.COMMONS_SESSION_MODELS?.split(',') ?? ['qwen3.5:2b', 'qwen3:1.7b', 'deepseek-r1:1.5b', 'gemma4-e2b-unsloth:latest'];
async function check(model, scenario, task) {
  const started = Date.now(); const firstEvent = events.length;
  try {
    const output = await task();
    const trace = events.slice(firstEvent).filter((event) => event.status !== 'running').map((event) => ({ tool: event.toolName, status: event.status, result: (event.result ?? '').slice(0, 500) }));
    results.push({ model, scenario, passed: true, seconds: (Date.now() - started) / 1000, trace, response: output?.response?.slice(0, 1500) });
  } catch (error) { results.push({ model, scenario, passed: false, seconds: (Date.now() - started) / 1000, error: error.message, trace: events.slice(firstEvent).filter((event) => event.status !== 'running').map((event) => ({ tool: event.toolName, status: event.status, result: (event.result ?? '').slice(0, 500) })) }); }
  writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
try {
  console.log("Preparing managed Python before model tests");
  await runtime.preparePython();
  for (const model of models) {
    const state = runtime.saveAgent({ name: `Reliability ${model}`, instructions: 'Complete requests directly with available tools and verify results. Use computed Python plots for real data.', model });
    const agentId = state.agents.at(-1).id;
    let conversationId;
    await check(model, 'selected folder and switch', async () => {
      const first = await runtime.sendMessage({ agentId, workspaceRoot: a, knowledgeMode: 'off', webSearchEnabled: false, prompt: 'List the selected folder and read its txt file. Tell me the actual folder path and code you found.' });
      conversationId = first.conversation.id;
      assert.ok(first.conversation.messages.some((message) => message.toolName === 'cli_read_file' && message.content.includes('mango-731')), 'Did not read the selected Folder A');
      const second = await runtime.sendMessage({ agentId, conversationId, workspaceRoot: b, prompt: 'I have switched the selected folder. List it and read its txt file. Tell me the current actual folder path and code.' });
      assert.equal(second.conversation.workspaceRoot, realpathSync(b));
      assert.ok(second.conversation.messages.some((message) => message.toolName === 'cli_read_file' && message.content.includes('papaya-842')), 'Did not read the newly selected Folder B');
      assert.equal(runtime.state().settings.defaultModel, state.settings.defaultModel, 'Agent changed the workspace default model');
      return second;
    });
    await check(model, 'attached CSV to computed PNG and JSON without folder', async () => {
      const output = await runtime.sendMessage({ agentId, workspaceRoot: null, attachmentIds: [fileId], knowledgeMode: 'off', webSearchEnabled: false, prompt: 'Use Python to analyze the attached heart_rate.csv. Calculate each column mean and save means.json, then plot each column against row number and save heart-rate.png. Execute this yourself and verify the saved outputs.' });
      const tools = output.conversation.messages.filter((message) => message.role === 'tool');
      assert.ok(tools.some((message) => message.toolName === 'run_python' && !message.content.startsWith('Error:')), 'No successful Python execution');
      assert.ok(!tools.some((message) => message.toolName === 'generate_image'), 'Image generator used for data');
      const json = output.conversation.artifacts?.find((file) => file.name === 'means.json');
      const png = output.conversation.artifacts?.find((file) => file.name === 'heart-rate.png');
      assert.ok(json && png, 'Computed files missing');
      const means = JSON.parse(readFileSync(json.path, 'utf8'));
      const columns = ['T1', 'T2', 'T3', 'T4'];
      for (const [index, column] of columns.entries()) assert.equal(Array.isArray(means) ? means[index] : (means[column] ?? means.means?.[column]), 64 + index * 10);
      assert.equal(readFileSync(png.path).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(runtime.getArtifactPath(output.conversation.id, png.id), realpathSync(png.path));
      return output;
    });
  }
} finally {
  runtime.close();
  console.log(`Verification files: ${root}`);
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
