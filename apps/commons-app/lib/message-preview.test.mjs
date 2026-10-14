import assert from "node:assert/strict";
import test from "node:test";
import { messagePreview } from "./message-preview.ts";

test("agent replies become one plain line", () => {
  assert.equal(
    messagePreview("Here is a **first pass**.\n\n## Major players\n- M-Pesa leads\n- Banks follow", "ai"),
    "Here is a first pass. Major players M-Pesa leads Banks follow",
  );
  assert.equal(messagePreview("See [the report](https://x.io) and `npm test`", "ai"), "See the report and npm test");
  assert.equal(messagePreview("Run this:\n```bash\nrm -rf /\n```\nThen tell me", "ai"), "Run this: Then tell me");
});

test("your own messages read like a messenger", () => {
  assert.equal(messagePreview("Draft the launch email", "human"), "You: Draft the launch email");
  assert.equal(messagePreview("Draft it", "user"), "You: Draft it");
});

test("empty or markup-only messages give nothing", () => {
  assert.equal(messagePreview("", "ai"), "");
  assert.equal(messagePreview(null, "ai"), "");
  assert.equal(messagePreview("```\ncode only\n```", "ai"), "");
});
