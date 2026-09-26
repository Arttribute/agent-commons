import assert from "node:assert/strict";
import test from "node:test";
import { compactToolLoop, localChatHistory, toolResult } from "./local-chat-history.ts";

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
