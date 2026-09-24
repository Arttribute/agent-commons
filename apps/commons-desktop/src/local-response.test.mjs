import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantIdentityAnswer, assistantIdentityRequestKind, assistantNameAnswer, isAssistantIdentityRequest, looksLikeInventedToolCall, looksLikeModelIdentity, parseToolArguments } from "./local-response.ts";

test("rejects fabricated function JSON but preserves ordinary conversation", () => {
  assert.equal(looksLikeInventedToolCall('```json\n{"name":"hello","arguments":{}}\n```'), true);
  assert.equal(looksLikeInventedToolCall('{"name":"Myself","arguments":{"age":30}}'), true);
  assert.equal(looksLikeInventedToolCall("Hello! How can I help?"), false);
  assert.equal(looksLikeInventedToolCall('{"name":"Alice","age":30}'), false);
});

test("distinguishes assistant identity from the underlying local model", () => {
  assert.equal(isAssistantIdentityRequest("Tell me something about yourself"), true);
  assert.equal(assistantIdentityRequestKind("What is your name?"), "name");
  assert.equal(assistantIdentityRequestKind("What's your name?"), "name");
  assert.equal(assistantIdentityRequestKind("What should I call you locally?"), "name");
  assert.equal(assistantIdentityRequestKind("Who are you?"), "about");
  assert.equal(assistantIdentityRequestKind("What is your role?"), "about");
  assert.equal(assistantIdentityRequestKind("What is your model's name?"), null);
  assert.equal(assistantIdentityRequestKind("What is your name and edit README.md"), null);
  assert.equal(assistantNameAnswer("Commons Copilot"), "My name is Commons Copilot.");
  assert.equal(assistantNameAnswer("Research Agent"), "My name is Research Agent.");
  assert.equal(isAssistantIdentityRequest("What model are you running?"), false);
  assert.equal(looksLikeModelIdentity("I am Gemma 4, a Large Language Model."), true);
  assert.equal(looksLikeModelIdentity("My name is Gemma 4."), true);
  assert.equal(looksLikeModelIdentity("I'm Commons Copilot, running on Gemma 4."), false);
  assert.match(assistantIdentityAnswer("Commons Copilot", "gemma4"), /Commons Copilot.*Private Local/);
});

test("accepts only object arguments from native tool calls", () => {
  assert.deepEqual(parseToolArguments('{"path":"README.md"}'), { path: "README.md" });
  assert.deepEqual(parseToolArguments({ path: "README.md" }), { path: "README.md" });
  assert.equal(parseToolArguments("not JSON"), null);
  assert.equal(parseToolArguments("[]"), null);
});
