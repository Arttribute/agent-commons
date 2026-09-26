import assert from "node:assert/strict";
import test from "node:test";
import { readOllamaChatResponse } from "./ollama-stream.ts";

function response(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  }));
}

test("reads content across network and UTF-8 boundaries", async () => {
  const tokens = [];
  const result = await readOllamaChatResponse(response([
    '{"message":{"content":"Hell',
    'o "}}\n{"message":{"content":"🌍"},"done":false}\n',
    '{"done":true}\n',
  ]), (content) => tokens.push(content));
  assert.equal(result.content, "Hello 🌍");
  assert.deepEqual(tokens, ["Hello ", "Hello 🌍"]);
});

test("collects native tool calls and rejects incomplete streams", async () => {
  const call = { function: { name: "cli_read_file", arguments: { path: "README.md" } } };
  const result = await readOllamaChatResponse(response([
    JSON.stringify({ message: { content: "", tool_calls: [call] }, done: false }) + "\n",
    '{"done":true}\n',
  ]));
  assert.deepEqual(result.tool_calls, [call]);
  await assert.rejects(readOllamaChatResponse(response(['{"message":{"content":"partial"}}\n'])), /before completion/);
});

test("preserves model thinking for tool continuation without displaying it as chat text", async () => {
  const tokens = [];
  const result = await readOllamaChatResponse(response([
    '{"message":{"thinking":"Inspect the "}}\n',
    '{"message":{"thinking":"workspace","content":"Checking files"},"done":true}\n',
  ]), (content) => tokens.push(content));
  assert.equal(result.thinking, "Inspect the workspace");
  assert.deepEqual(tokens, ["Checking files"]);
});
