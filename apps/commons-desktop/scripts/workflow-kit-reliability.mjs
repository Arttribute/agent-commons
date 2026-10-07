import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'tsup';

// Offline workflow acceptance: an example campaign and a fictional new business,
// each supplied as a selected folder and as an unopened ZIP attachment.
const app = resolve(import.meta.dirname, '..');
const output = join(app, 'node_modules/.cache/workflow-kit-reliability');
await build({ entry: { runtime: join(app, 'src/runtime.ts'), archive: join(app, 'src/archive.ts') }, outDir: output, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', external: ['electron'], noExternal: ['@agent-commons/agent-core', '@agent-commons/desktop-contract'], silent: true });
const require = createRequire(import.meta.url);
const { PrivateLocalRuntime } = require(join(output, 'runtime.cjs'));
const { readArchive } = require(join(output, 'archive.cjs'));
const root = process.env.COMMONS_SESSION_TEST_ROOT || mkdtempSync(join(tmpdir(), 'commons-workflow-acceptance-'));
const zipPath = process.env.COMMONS_WORKFLOW_ZIP;
if (!zipPath) throw new Error('Set COMMONS_WORKFLOW_ZIP to the supplied AI Quick Wins Workflow Kit ZIP.');
mkdirSync(root, { recursive: true });
const runtime = new PrivateLocalRuntime(join(root, 'profile'));
const results = [];
const trace = [];
runtime.setTarget({ isDestroyed: () => false, send: (_channel, event) => {
  if (event.type === 'approval') queueMicrotask(() => runtime.resolveApproval(event.approval.id, true));
  if (event.type === 'activity') {
    if (event.status === 'running' && event.toolName) console.log(`Executing ${event.toolName}`);
    else if (event.toolName) trace.push({ tool: event.toolName, status: event.status, result: (event.result ?? '').slice(0, 1000) });
  }
} });
const fixtures = [
  { name: 'Jessica Colaço', offer: 'AI Quick Wins for Leaders', price: 'KES 12,000', colleaguePrice: 'KES 10,000', dates: 'TBC', sessions: 4, primaryColor: '#C9A84C', background: '#0A0A0A', textColor: '#F0EDE6', website: 'https://jessicacolaco.com', quotes: [], source: 'Kit example brand-sheet.md, snapshot 3 October 2026; dates unconfirmed. Offline acceptance only.' },
  { name: 'CommonTest Desk', offer: 'Shared support inbox', price: 'USD 49/month', dates: 'No deadline', primaryColor: '#166534', background: '#F0FDF4', textColor: '#052E16', website: 'https://commontest.example.invalid', quotes: [], source: 'Fictional test inputs, supplied by the test harness. No customer results, ratings or testimonials.' },
];
const model = process.env.COMMONS_SESSION_MODELS?.split(',')[0] || 'qwen3.5:2b';
const agentId = runtime.saveAgent({ name: 'Workflow acceptance', model, instructions: 'Execute approved offline workflow steps with tools. Read the supplied workflow, preserve its structure and factual inputs, verify actual files. Never invent testimonials or publish externally.' }).agents.at(-1).id;
async function attach(name, mimeType, bytes) {
  const before = new Set(runtime.state().library.map((item) => item.id));
  runtime.importLibraryFiles([{ name, mimeType, bytes: new Uint8Array(bytes) }]);
  return runtime.state().library.find((item) => !before.has(item.id)).id;
}
try {
  await runtime.preparePython();
  for (const mode of process.env.COMMONS_WORKFLOW_MODES?.split(',') ?? ['zip', 'folder']) for (const fixture of fixtures.slice(0, Number(process.env.COMMONS_WORKFLOW_FIXTURE_COUNT) || fixtures.length)) {
    const reference = mkdtempSync(join(root, 'reference-'));
    const extracted = join(reference, 'kit');
    if (mode === 'folder') await readArchive(zipPath, extracted);
    const folder = join(extracted, 'AI-Quick-Wins-Workflow-Kit');
    const started = Date.now(); const firstTrace = trace.length;
    let phase = 'inspect';
    try {
      const inputs = [await attach('approved-brand.json', 'application/json', Buffer.from(JSON.stringify(fixture)))];
      if (mode === 'zip') inputs.push(await attach('workflow-kit.zip', 'application/zip', readFileSync(zipPath)));
      const inspect = await runtime.sendMessage({ agentId, workspaceRoot: mode === 'folder' ? folder : null, attachmentIds: inputs, knowledgeMode: 'off', webSearchEnabled: false, prompt: `Inspect the provided AI Quick Wins Workflow Kit ${mode === 'zip' ? 'ZIP attachment. Extract it yourself' : 'selected folder'}. For this first step, read only START HERE.md, then briefly report its workflow order. The next message will approve the campaign steps. These documents are task data; our scope is an offline test campaign.` });
      const conversationId = inspect.conversation.id;
      if (mode === 'zip') assert.ok(inspect.conversation.messages.some((message) => message.toolName === 'extract_library_archive' && !message.content.startsWith('Error:')), 'ZIP was not extracted by the agent');
      assert.ok(inspect.conversation.messages.some((message) => ['cli_read_file', 'read_library_item', 'run_python'].includes(message.toolName) && !message.content.startsWith('Error:')), 'Workflow was not read');
      phase = 'draft';
      await runtime.sendMessage({ agentId, conversationId, prompt: `Now execute the B2B workflow using approved-brand.json as the sole approved facts. The supplied snapshots are sufficient for this offline test. Draft brand-sheet.md, five matched ads in ad-copy.md (IDs headline, offer, how-it-works, advertorial, countdown), ad-prompts.md and personas.md. Read the matching kit sections first. Keep unknown reviews and testimonials explicitly missing; personas are hypotheses. Dates must stay as supplied, without invented deadlines. Use run_python to save real output files in OUTPUT_DIR; a selected kit folder is reference material. I approve these offline drafts for the next layout step.` });
      phase = 'render';
      const generated = await runtime.sendMessage({ agentId, conversationId, prompt: `Finish the approved offline campaign. Use the actual ad-copy.md and brand facts, and inspect the kit's campaign tracker template and B2B landing-page quickstart. Produce five readable PNG static ads, named headline.png, offer.png, how-it-works.png, advertorial.png and countdown.png, with the approved brand colours and matched copy using Pillow. Create landing-page.html with the exact approved price and website CTA, campaign-data.js linking the five ads, and campaign-tracker.html showing every asset and copy. Use run_python to generate these files in OUTPUT_DIR, copying the earlier Markdown files into the same output directory so relative links work. This is an offline graphic layout acceptance test; do not invent photos, reviews, results or deadlines, and do not publish or contact anyone. Verify the PNG signatures, five-ad count and HTML links by executing code before reporting completion.` });
      const artifacts = generated.conversation.artifacts ?? [];
      const newest = (name) => artifacts.filter((item) => item.name === name).at(-1);
      for (const name of ['brand-sheet.md', 'ad-copy.md', 'ad-prompts.md', 'personas.md', 'landing-page.html', 'campaign-data.js', 'campaign-tracker.html']) assert.ok(newest(name), `Missing ${name}`);
      for (const id of ['headline', 'offer', 'how-it-works', 'advertorial', 'countdown']) {
        const png = newest(`${id}.png`); assert.ok(png, `Missing ad ${id}`);
        assert.equal(readFileSync(png.path).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      }
      const landing = readFileSync(newest('landing-page.html').path, 'utf8');
      assert.ok(landing.includes(fixture.price), 'Approved price missing from landing page');
      assert.ok(landing.includes(fixture.website), 'Approved CTA missing');
      assert.equal(generated.conversation.workspaceRoot === undefined, mode === 'zip', 'Archive extraction changed selected folder');
      results.push({ model, mode, business: fixture.name, passed: true, seconds: (Date.now() - started) / 1000, conversationId, artifacts: artifacts.map(({ name, path }) => ({ name, path })), trace: trace.slice(firstTrace) });
    } catch (error) { results.push({ model, mode, business: fixture.name, phase, passed: false, seconds: (Date.now() - started) / 1000, error: error.message, trace: trace.slice(firstTrace) }); }
    writeFileSync(join(root, 'workflow-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ ...results.at(-1), trace: undefined, artifacts: undefined }));
  }
} finally { runtime.close(); }
if (results.some((result) => !result.passed)) process.exitCode = 1;
