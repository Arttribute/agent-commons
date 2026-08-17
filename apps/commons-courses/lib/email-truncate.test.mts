import assert from "node:assert/strict";
import test from "node:test";
import { truncateEmailText } from "./email/truncate.ts";

test("keeps short commitment copy intact", () => {
  assert.equal(
    truncateEmailText("Use Claude to prepare the next team update."),
    "Use Claude to prepare the next team update.",
  );
});

test("normalizes whitespace and truncates on a meaningful sentence boundary", () => {
  const value = `${"A".repeat(170)}. ${"B".repeat(180)}.`;
  const result = truncateEmailText(value, 280);
  assert.equal(result, `${"A".repeat(170)}.…`);
  assert.ok(result.length <= 281);
});

test("falls back to a word boundary for long unpunctuated copy", () => {
  const result = truncateEmailText("meaningful ".repeat(50), 90);
  assert.ok(result.endsWith("…"));
  assert.ok(!result.endsWith(" …"));
  assert.ok(result.length <= 91);
});
