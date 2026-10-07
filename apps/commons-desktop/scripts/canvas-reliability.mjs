import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { build } from 'tsup';

// Real installed-model acceptance through the Desktop harness, not direct chat.
const app = resolve(import.meta.dirname, '..');
const output = join(app, 'node_modules', '.cache', 'canvas-reliability');
await build({ entry: { runtime: join(app, 'src/runtime.ts') }, outDir: output, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', external: ['electron'], noExternal: ['@agent-commons/agent-core', '@agent-commons/desktop-contract'], silent: true });
const { PrivateLocalRuntime } = createRequire(import.meta.url)(join(output, 'runtime.cjs'));
const root = process.env.COMMONS_SESSION_TEST_ROOT || mkdtempSync(join(tmpdir(), 'commons-canvas-'));
mkdirSync(root, { recursive: true });
const runtime = new PrivateLocalRuntime(join(root, 'profile'));
const trace = [];
runtime.setTarget({ isDestroyed: () => false, send: (_channel, event) => {
  if (event.type === 'approval') queueMicrotask(() => runtime.resolveApproval(event.approval.id, true));
  if (event.type === 'activity') { trace.push(event); console.log(JSON.stringify({ tool: event.toolName, status: event.status })); }
} });
const results = [];
const test = async (model, scenario, task) => {
  const start = Date.now(); const first = trace.length;
  try { const result = await task(); results.push({ model, scenario, passed: true, seconds: (Date.now() - start) / 1000, ...result }); }
  catch (error) { results.push({ model, scenario, passed: false, seconds: (Date.now() - start) / 1000, error: error.message }); }
  results.at(-1).trace = trace.slice(first);
  writeFileSync(join(root, 'canvas-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ...results.at(-1), trace: undefined }));
};
try {
  const [original, revised, image] = runtime.importLibraryFiles([
    { name: 'canvas-data.csv', mimeType: 'text/csv', bytes: Buffer.from('item,total\nAlpha,20\nBeta,40\nGamma,900\n') },
    { name: 'canvas-data-revised.csv', mimeType: 'text/csv', bytes: Buffer.from('item,total\nAlpha,200\nBeta,400\nGamma,900\n') },
    { name: 'canvas-view.png', mimeType: 'image/png', bytes: picture() },
  ]);
  const canvas = runtime.canvas.open(original.id); const projectId = canvas.project.projectId;
  const note = runtime.canvas.createNote(projectId, { revisionId: canvas.revisions[0].revisionId, kind: 'comment', body: 'Analyze these two cells only', metadata: { target: { type: 'cells', sheet: 'canvas-data', range: 'B2:B3', values: [['20'], ['40']] } } });
  runtime.canvas.addVersion(projectId, revised.id, 'Changed values');
  const visual = runtime.canvas.open(image.id);
  const region = runtime.canvas.createNote(visual.project.projectId, { revisionId: visual.revisions[0].revisionId, kind: 'region', body: 'Identify this region', geometry: { x: .55, y: .1, width: .4, height: .8 }, metadata: { target: { type: 'region' }, intrinsicSize: { width: 320, height: 160 } } });
  for (const model of process.env.COMMONS_SESSION_MODELS?.split(',') ?? ['qwen3.5:2b-q4_K_M', 'gemma4-e2b-unsloth:latest']) {
    const agentId = runtime.saveAgent({ name: `Canvas test ${model}`, instructions: 'Use local tools when useful. Verify work you create. Never invent a source or result.', model }).agents.at(-1).id;
    await test(model, 'selected cells use viewed original despite a newer active version', async () => {
      const result = await runtime.sendMessage({ agentId, workspaceRoot: null, knowledgeMode: 'off', webSearchEnabled: false,
        uiContext: { resourceType: 'canvas', resourceId: projectId, canvasRevisionId: canvas.revisions[0].revisionId, annotationIds: [note.annotationId], canvasViewer: { sheet: 'canvas-data' } },
        prompt: 'Analyze only the cells in the attached canvas note from the version I am viewing. Use run_python to read that exact CSV, calculate the sum of the two selected cells, and save selection-summary.json containing total and file_id (the actual Library fileId of that CSV). The canvas has a newer version, but this request concerns the viewed original. Verify your saved JSON.' });
      const artifact = result.conversation.artifacts?.filter((entry) => entry.name === 'selection-summary.json').at(-1);
      assert.ok(artifact, 'No verified JSON output');
      const data = JSON.parse(readFileSync(artifact.path, 'utf8')); assert.equal(data.total, 60); assert.equal(data.file_id, original.id);
      return { conversationId: result.conversation.id, artifact: artifact.path, total: data.total };
    });
    await test(model, 'marked image region is interpreted from actual pixels', async () => {
      const result = await runtime.sendMessage({ agentId, workspaceRoot: null, knowledgeMode: 'off', webSearchEnabled: false,
        uiContext: { resourceType: 'canvas', resourceId: visual.project.projectId, canvasRevisionId: visual.revisions[0].revisionId, annotationIds: [region.annotationId], canvasViewer: {} },
        prompt: 'Look at the attached image and exact region in the attached note. Return JSON with marked_region_color and other_side_color. Identify which color belongs to the marked region using the annotation coordinates and actual pixels.' });
      const colors = JSON.parse(result.response.match(/\{[^{}]*\}/)?.[0] ?? 'null');
      assert.ok(colors, 'No verifiable color mapping');
      const equivalent = (actual, name, rgb) => {
        const value = String(actual).toLowerCase();
        return value.includes(name) || value.replace(/\s/g, '').includes(`rgb(${rgb.join(',')})`);
      };
      assert.ok(equivalent(colors.marked_region_color, 'yellow', [255, 230, 0]), `Wrong marked-region color: ${colors.marked_region_color}`);
      assert.ok(equivalent(colors.other_side_color, 'blue', [0, 60, 230]), `Wrong opposite-side color: ${colors.other_side_color}`);
      return { conversationId: result.conversation.id, response: result.response };
    });
  }
} finally { runtime.close(); console.log(`Verification files: ${root}`); }
if (results.some((result) => !result.passed)) process.exitCode = 1;

function picture() {
  const width = 320, height = 160;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    raw.set(x < width / 2 ? [0, 60, 230] : [255, 230, 0], offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const chunk = (type, data) => {
    const name = Buffer.from(type); const payload = Buffer.concat([name, data]); let crc = 0xffffffff;
    for (const byte of payload) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, payload, checksum]);
  };
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
