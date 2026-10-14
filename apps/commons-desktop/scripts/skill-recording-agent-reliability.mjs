import assert from 'node:assert/strict';
import { build } from 'tsup';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.env.COMMONS_RECORDING_TEST_ROOT;
if (!root) throw new Error('Set COMMONS_RECORDING_TEST_ROOT to the generated recording fixture folder.');
const app = resolve(import.meta.dirname, '..');
const output = join(app, 'node_modules/.cache/skill-recording-agent');
await build({ entry: { runtime: join(app, 'src/runtime.ts'), prompt: join(app, '../commons-app/lib/skill-recording.ts') }, outDir: output, format: ['cjs'], platform: 'node', target: 'node22', outExtension: () => ({ js: '.cjs' }), external: ['electron'], noExternal: ['@agent-commons/agent-core', '@agent-commons/desktop-contract'], silent: true });
const require = createRequire(import.meta.url);
const { PrivateLocalRuntime } = require(join(output, 'runtime.cjs'));
const { recordingSkillPrompt } = require(join(output, 'prompt.cjs'));
mkdirSync(root, { recursive: true });
const runtime = new PrivateLocalRuntime(join(root, `local-profile-${Date.now()}`));
const trace = [];
runtime.setTarget({ isDestroyed: () => false, send: (_channel, event) => {
  if (event.type === 'approval') queueMicrotask(() => runtime.resolveApproval(event.approval.id, true));
  if (event.type === 'activity') { trace.push(event); console.log(JSON.stringify({ tool: event.toolName, status: event.status })); }
} });
try {
  const model = process.env.COMMONS_RECORDING_TEST_MODEL || runtime.state().settings.defaultModel;
  const agentId = runtime.saveAgent({ name: 'Commons Copilot', model, instructions: 'Inspect supplied evidence before saving a private reusable skill. Parameterize examples, identify uncertainties, and include a replay checklist.' }).agents.at(-1).id;
  const [item] = runtime.importLibraryFiles([{ name: 'workflow-recording.webm', mimeType: 'video/webm', bytes: readFileSync(join(root, 'workflow-recording.webm')) }]);
  const evidence = JSON.parse(readFileSync(join(root, 'recording-evidence.json'), 'utf8'));
  const frames = runtime.saveRecordingFrames(item.id, evidence.frames, evidence.durationMs);
  runtime.updateLibraryItem(item.id, { mediaAnalysis: { frames, durationMs: evidence.durationMs, transcript: { segments: [], note: 'This fixture contains audio tones, not speech. Read the visible screen text; do not invent narration.' } } });
  const observed = await runtime.describeRecording(item.id, agentId);
  assert.match(observed.visualDescription ?? '', /report/i);
  assert.match(observed.visualDescription ?? '', /complet/i);
  assert.match(observed.visualDescription ?? '', /export|csv/i);
  const result = await runtime.sendMessage({ agentId, workspaceRoot: null, knowledgeMode: 'off', webSearchEnabled: false, attachmentIds: [item.id], prompt: recordingSkillPrompt(item.id, item.name) });
  const skills = runtime.state().skills;
  const created = skills.find((skill) => /report|export|filter/i.test(skill.name + skill.instructions));
  assert.ok(created, 'The agent did not save a reusable skill from the video');
  assert.match(created.instructions, /report/i);
  assert.match(created.instructions, /complet/i);
  assert.match(created.instructions, /export|csv/i);
  assert.match(created.instructions, /check|verif|validat/i);
  assert.ok(result.conversation.messages.some((message) => message.toolName === 'local_save_skill' && !message.content.startsWith('Error:')), 'No successful skill save tool evidence');
  writeFileSync(join(root, 'local-skill-result.json'), JSON.stringify({ model, conversationId: result.conversation.id, visualDescription: observed.visualDescription, skill: created, trace }, null, 2));
  console.log(JSON.stringify({ passed: true, model, skill: created.name, slug: created.slug }));
  if (process.env.COMMONS_RECORDING_REPLAY === 'true') {
    const source = Buffer.from('id,status,total\nA,completed,15\nB,open,25\nC,completed,40\n');
    const [report] = runtime.importLibraryFiles([{ name: 'replay-report.csv', mimeType: 'text/csv', bytes: source }]);
    const replay = await runtime.sendMessage({ agentId, workspaceRoot: null, knowledgeMode: 'off', webSearchEnabled: false, attachmentIds: [report.id],
      prompt: `Use the saved skill ${created.slug} on the attached replay-report.csv. This offline replay uses the Library CSV as the report source and the managed Python tool for the demonstrated read/filter/export sequence. Filter status=completed, save replay-completed.csv with every original column, and verify that only completed rows are exported. Keep the source unchanged and return the actual Library output. Invoke the saved skill first.` });
    const artifact = replay.conversation.artifacts?.findLast((entry) => entry.name.endsWith('replay-completed.csv'));
    assert.ok(artifact, 'Replay did not create its output');
    const csv = readFileSync(artifact.path, 'utf8');
    assert.match(csv, /A,completed,15/); assert.match(csv, /C,completed,40/); assert.doesNotMatch(csv, /B,open/);
    assert.ok(source.equals(readFileSync(report.path)), 'Replay changed the input');
    assert.ok(replay.conversation.messages.some((message) => message.toolName === 'invoke_skill'), 'Replay did not load the saved skill');
    writeFileSync(join(root, 'local-skill-replay.json'), JSON.stringify({ passed: true, model, conversationId: replay.conversation.id, artifact: artifact.name, csv, sourceUnchanged: true }));
    console.log(JSON.stringify({ replayPassed: true, model, sourceUnchanged: true, exportedRows: 2 }));
  }

} catch (error) {
  writeFileSync(join(root, 'local-skill-failure.json'), JSON.stringify({ error: error.message, trace, conversations: runtime.state().conversations.slice(-1) }, null, 2));
  throw error;
} finally { runtime.close(); }
