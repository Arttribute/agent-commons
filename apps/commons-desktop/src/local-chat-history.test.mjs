import assert from "node:assert/strict";
import test from "node:test";
import { compactToolLoop, libraryTextResult, localChatHistory, prepareLocalInference, toolResult } from "./local-chat-history.ts";

test('long Python failures retain structured stderr and its actual final cause', () => {
  const cause = 'ValueError: x and y must have the same first dimension';
  const raw = `Error: Python execution failed.\n${JSON.stringify({ exitCode: 1, stdout: 'source was read', stderr: 'Traceback\n'.repeat(1500) + cause, artifacts: [], workspace: '/outputs' })}`;
  const result = toolResult('run_python', raw).content;
  assert.ok(result.length <= 5000);
  assert.ok(result.startsWith('Error: Python execution failed.\n'));
  const data = JSON.parse(result.slice(result.indexOf('\n') + 1));
  assert.equal(data.exitCode, 1);
  assert.equal(data.stdout, 'source was read');
  assert.ok(data.stderr.endsWith(cause));
});

test('paginated Library reads preserve valid JSON and the exact next unread character', () => {
  const text = 'Quoted "facts", newlines\n and Unicode 👩🏽‍💻. '.repeat(300);
  const result = libraryTextResult('source-731', 'long-template.md', 'text/markdown', text, 500, text.length + 500);
  assert.ok(Buffer.byteLength(result) <= 4800);
  const parsed = JSON.parse(toolResult('read_library_item', result).content);
  assert.equal(parsed.content, text.slice(0, parsed.content.length));
  assert.equal(parsed.nextOffset, 500 + parsed.content.length);
  assert.equal(parsed.offset, 500);
});

test("replays saved commands as named call/result pairs before a follow-up", () => {
  const history = localChatHistory([
    { role: "user", content: "Create the project" },
    { role: "tool", toolName: "cli_start_process", toolArgs: { command: "npm" }, content: '{"processId":"proc_123","status":"running"}' },
    { role: "assistant", content: "The install is running" },
    { role: "user", content: "Finish setting it up" },
  ]);
  assert.equal(history[1].tool_calls[0].function.name, "cli_start_process");
  assert.equal(history[2].tool_name, "cli_start_process");
  assert.match(history[2].content, /proc_123/);
  assert.equal(history.at(-1).content, "Finish setting it up");
});

test("large command output cannot displace the current request or split tool pairs", () => {
  const messages = [{ role: "system", content: "Stay on task" }, { role: "user", content: "Build the mango project" }];
  for (let i = 0; i < 20; i++) {
    messages.push({ role: "assistant", content: "", tool_calls: [{ function: { name: "cli_wait_for_process", arguments: { processId: "p1" } } }] });
    messages.push(toolResult("cli_wait_for_process", "start" + "x".repeat(50_000) + "end"));
  }
  compactToolLoop(messages);
  assert.equal(messages[1].content, "Build the mango project");
  assert.ok(JSON.stringify(messages).length < 32_000);
  for (let i = 2; i < messages.length; i += 2) {
    assert.ok(messages[i].tool_calls);
    assert.equal(messages[i + 1].tool_name, "cli_wait_for_process");
  }
  assert.match(messages.at(-1).content, /^start[\s\S]*end$/);
});

test("oversized user requests fail explicitly rather than silently losing the task", () => {
  const request = "important requirement ".repeat(3_000);
  const messages = [{ role: "system", content: "instructions" }, ...localChatHistory([{ role: "user", content: request }])];
  assert.equal(messages.at(-1).content, request);
  assert.throws(() => compactToolLoop(messages), /context budget/);
});

test('a tight tool budget preserves the latest parallel call/result group', () => {
  const messages = [{ role: 'system', content: 'Keep verified context' }, { role: 'user', content: 'Inspect this canvas' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_canvas', arguments: { projectId: 'owned' } } }, { function: { name: 'read_library_item', arguments: { itemId: 'source' } } }] },
    { role: 'tool', tool_name: 'read_canvas', content: 'Canvas details '.repeat(400) },
    { role: 'tool', tool_name: 'read_library_item', content: 'Source data '.repeat(400) }];
  compactToolLoop(messages, 2000);
  assert.equal(messages.length, 5);
  assert.equal(messages[2].tool_calls.length, 2);
  assert.deepEqual(messages.slice(3).map((message) => message.tool_name), ['read_canvas', 'read_library_item']);
  assert.ok(Buffer.byteLength(JSON.stringify(messages)) <= 2000);
});

test('large structured tool output stays parseable with verified IDs and numeric results', () => {
  const data = { exitCode: 0, stdout: 'source facts '.repeat(900), stderr: '', artifacts: [{ fileId: 'verified-id', name: 'stats.json' }], result: { slope: 2 } };
  const bounded = JSON.parse(toolResult('run_python', JSON.stringify(data)).content);
  assert.equal(bounded.exitCode, 0);
  assert.equal(bounded.result.slope, 2);
  assert.deepEqual(bounded.artifacts, data.artifacts);
  assert.match(bounded.stdout, /Text shortened/);
});

test('reduces output reserve before shortening the newest source result', () => {
  const content = 'Source facts '.repeat(250);
  const messages = [{ role: 'system', content: 'x'.repeat(9000) }, { role: 'user', content: 'Read the source' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_library_item', arguments: { itemId: 'source' } } }] },
    { role: 'tool', tool_name: 'read_library_item', content }];
  const outputTokens = prepareLocalInference(messages, 6000, 4);
  assert.equal(outputTokens, 2048);
  assert.equal(messages.at(-1).content, content);
});

test("retains recent process evidence when earlier output exceeds the history budget", () => {
  const history = [{ role: "user", content: "Create Mango" }];
  for (let i = 0; i < 10; i++) history.push({ role: "tool", toolName: "cli_wait_for_process", toolArgs: { processId: "p1" }, content: `process-${i}\n` + "x".repeat(9_000) });
  history.push({ role: "assistant", content: "Still running" }, { role: "user", content: "Finish it" });
  const messages = localChatHistory(history);
  assert.equal(messages[0].content, "Create Mango");
  assert.ok(messages.some((message) => message.role === "tool" && message.content.includes("process-9")));
  assert.equal(messages.at(-1).content, "Finish it");
});

test('reserves output and tool schema space while preserving the request and complete tool pairs', async () => {
  const { localPromptCharacterBudget, LOCAL_CONTEXT_SIZE } = await import('./local-chat-history.ts');
  const schemaCharacters = 6000, outputTokens = 4096;
  const limit = localPromptCharacterBudget(outputTokens, schemaCharacters, 2);
  const messages = [{ role: 'system', content: 'Exact root /selected/project; source item original-731.' }, { role: 'user', content: 'Save a computed chart from the viewed original.' }];
  for (let i = 0; i < 8; i++) {
    messages.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_library_item', arguments: { itemId: 'original-731' } } }] }, toolResult('read_library_item', 'verified reference ' + 'x'.repeat(9000)));
  }
  compactToolLoop(messages, limit);
  assert.ok(Buffer.byteLength(JSON.stringify(messages)) <= limit);
  assert.ok(Math.ceil(Buffer.byteLength(JSON.stringify(messages)) / 2) + Math.ceil(schemaCharacters / 2) + 2 * 1024 + outputTokens + 512 <= LOCAL_CONTEXT_SIZE);
  assert.match(messages[0].content, /original-731/);
  assert.match(messages[1].content, /viewed original/);
  assert.ok(messages.at(-2).tool_calls);
  assert.equal(messages.at(-1).tool_name, 'read_library_item');
});

test('video and tool context reduces output reserve before rejecting the current task', async () => {
  const { prepareLocalInference, localPromptCharacterBudget, LOCAL_CONTEXT_SIZE } = await import('./local-chat-history.ts');
  const messages = [{ role: 'system', content: 's'.repeat(8500) }, { role: 'user', content: 'Analyze my actual recording and save a reusable skill. '+ 'x'.repeat(1300) }];
  const original = JSON.stringify(messages);
  const outputTokens = prepareLocalInference(messages, 6000, 4);
  assert.equal(outputTokens, 3072);
  assert.equal(JSON.stringify(messages), original);
  assert.ok(Buffer.byteLength(JSON.stringify(messages)) <= localPromptCharacterBudget(outputTokens, 6000, 4));
  assert.ok(Math.ceil(Buffer.byteLength(JSON.stringify(messages)) / 2) + 3000 + 4096 + outputTokens + 512 <= LOCAL_CONTEXT_SIZE);
  assert.equal(prepareLocalInference([{ role: 'system', content: 'short' }, { role: 'user', content: 'hi' }]), 4096);
});
