import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocalCommand } from "./local-command.ts";

test("normalizes the Next.js command returned by a local model and prevents stdin prompts", () => {
  assert.deepEqual(normalizeLocalCommand({ command: "npx create-next-app@latest", args: ["mango-app"], cwd: "Desktop" }), {
    command: "npx", args: ["--yes", "create-next-app@latest", "mango-app", "--yes"], cwd: "Desktop",
  });
  assert.deepEqual(normalizeLocalCommand({ command: "npx create-next-app@latest mango-app", args: ["create-next-app@latest", "mango-app"] }).args,
    ["--yes", "create-next-app@latest", "mango-app", "--yes"]);
});

test("preserves quoted literal arguments, rejects implicit shell operations, and keeps executable paths", () => {
  assert.deepEqual(normalizeLocalCommand({ command: 'node -e "console.log(\'hello world\')"' }), { command: "node", args: ["-e", "console.log('hello world')"] });
  assert.throws(() => normalizeLocalCommand({ command: "echo hi && rm file" }), /explicit shell/);
  assert.throws(() => normalizeLocalCommand({ command: "echo $(pwd)" }), /explicit shell/);
  assert.throws(() => normalizeLocalCommand({ command: 'node "missing' }), /unclosed quote/);
  assert.deepEqual(normalizeLocalCommand({ command: process.execPath, args: ["-v"] }), { command: process.execPath, args: ["-v"] });
});
