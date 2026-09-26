import assert from "node:assert/strict";
import test from "node:test";
import { homedir } from "node:os";
import { computerWorkspace, terminalCommand } from "./local-computer.ts";

test("native windows use the selected conversation's workspace and reject unrelated sessions", () => {
  const state = { agents: [{ id: "a" }], conversations: [{ id: "c", agentId: "a", workspaceRoot: homedir() }] };
  assert.equal(computerWorkspace(state, "a", "c"), homedir());
  assert.throws(() => computerWorkspace(state, "a", "missing"), /conversation not found/);
  assert.throws(() => computerWorkspace(state, "b", "c"), /agent not found/);
});

test("terminal paths remain literal across operating systems", () => {
  const path = "/a folder/it's; $(echo bad)";
  assert.deepEqual(terminalCommand("darwin", path).args, ["-a", "Terminal", path]);
  assert.deepEqual(terminalCommand("linux", path).args, []);
  const windows = terminalCommand("win32", path);
  assert.equal(Buffer.from(windows.args.at(-1), "base64").toString("utf16le"), "Set-Location -LiteralPath '/a folder/it''s; $(echo bad)'");
});
