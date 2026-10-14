import assert from "node:assert/strict";
import test from "node:test";
import { capabilitySuggestions, fallbackSuggestions, normalizeSuggestions } from "./start-suggestions.ts";

const day = new Date("2026-10-14T09:00:00Z");

test("new people see three capability ideas, led by a connected app", () => {
  const plain = capabilitySuggestions([], day);
  assert.equal(plain.length, 3);
  assert.ok(plain.every((item) => !item.app));
  const withGmail = capabilitySuggestions(["Gmail", "Google Calendar"], day);
  assert.equal(withGmail.length, 3);
  assert.equal(withGmail[0].app, "Gmail");
  assert.equal(withGmail.filter((item) => item.app).length, 1);
});

test("the capability pick is stable within a day", () => {
  assert.deepEqual(capabilitySuggestions([], day), capabilitySuggestions([], new Date("2026-10-14T20:00:00Z")));
});

test("fallback offers to continue the latest titled chat", () => {
  const items = fallbackSuggestions([{ sessionId: "a", agentId: "x", title: "New chat" }, { sessionId: "b", agentId: "writer", title: "Launch plan" }], [], day);
  assert.equal(items[0].href, "/sessions/b");
  assert.equal(items[0].agentId, "writer");
  assert.match(items[0].detail, /Launch plan/);
  assert.match(items[0].text, /Launch plan/);
  assert.equal(items.length, 3);
});

test("API suggestions are trimmed, deduplicated and capped", () => {
  const items = normalizeSuggestions({
    suggestions: [
      { text: "  \"Draft the launch email\" ", app: "Gmail" },
      { text: "Draft the launch email" },
      { text: "" },
      { text: "Schedule a weekly review", kind: "schedule", agentId: "copilot", prompt: "Every  Friday, review my week.", detail: "You set up briefings last week." },
      { text: "Summarize the research", kind: "bogus" },
      { text: "A fourth one" },
    ],
  });
  assert.deepEqual(items.map((item) => item.text), ["Draft the launch email", "Schedule a weekly review", "Summarize the research"]);
  assert.equal(items[0].app, "Gmail");
  assert.equal(items[1].kind, "schedule");
  assert.equal(items[1].agentId, "copilot");
  assert.equal(items[1].prompt, "Every Friday, review my week.");
  assert.equal(items[1].detail, "You set up briefings last week.");
  assert.equal(items[0].agentId, null);
  assert.equal(items[2].kind, undefined);
  assert.deepEqual(normalizeSuggestions(null), []);
});
