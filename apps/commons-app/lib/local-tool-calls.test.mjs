import assert from "node:assert/strict";
import test from "node:test";
import { localToolCalls } from "./local-tool-calls.ts";

test("local file and command actions become the same computer events as Cloud chat", () => {
  const messages = [
    { role: "user", content: "old request" },
    { role: "tool", toolName: "cli_read_file", toolArgs: { path: "old.txt" }, content: "old" },
    { role: "assistant", content: "old response" },
    { role: "user", content: "build the app" },
    { role: "tool", toolName: "cli_write_file", toolArgs: { path: "src/app.ts", content: "export {}" }, content: "Written src/app.ts", createdAt: "2026-09-24T00:00:00Z" },
    { role: "tool", toolName: "cli_run_command", toolArgs: { command: "pnpm", args: ["build"] }, content: "Build complete", createdAt: "2026-09-24T00:00:01Z" },
  ];

  const calls = localToolCalls(messages);
  assert.deepEqual(calls.map((call) => call.name), ["writeComputerFiles", "runComputerCommand"]);
  assert.equal(calls[0].args.files[0].path, "src/app.ts");
  assert.equal(calls[1].args.command, "pnpm build");
  assert.equal(calls[1].result.output, "Build complete");
});
