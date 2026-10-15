import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "tsup";
import { COMMONS_COPILOT_OPERATING_GUIDE } from "../../commons-api/src/agent/copilot-platform-guide.ts";
import { isLocalConversationOnlyRequest, isLocalFolderInventoryRequest, localPromptAgent, localTaskGuidance } from "./local-prompt.ts";

const imported = {
  id: "cloud-copilot", name: "Commons Copilot", source: "cloud", isDefault: true,
  instructions: "You are Commons Copilot, the user's native guide and co-creator inside Agent Commons.\n" + COMMONS_COPILOT_OPERATING_GUIDE + "\nNever claim that a pending Cloud proposal has been applied.".repeat(60),
  model: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

test("the built-in Cloud Copilot gets a compact Local counterpart without editing stored or custom instructions", () => {
  const original = JSON.stringify(imported);
  assert.ok(imported.instructions.length > 10_000);
  const prompt = localPromptAgent(imported);
  assert.ok(prompt.instructions.length < 1_000);
  assert.match(prompt.instructions, /only the tools actually provided/);
  assert.match(prompt.instructions, /respect approvals/);
  assert.equal(JSON.stringify(imported), original);
  for (const custom of [
    { ...imported, isDefault: false },
    { ...imported, source: "local" },
    { ...imported, instructions: "Custom Copilot: use my exact approved facts. ".repeat(300) },
  ]) assert.equal(localPromptAgent(custom), custom);
});

test("Local loads detailed data guidance for computations and their continuations, not every conversation", () => {
  assert.ok(localTaskGuidance("Tell me a joke", false).length < 500);
  assert.ok(localTaskGuidance("What is in this folder?", true).length < 1_500);
  assert.match(localTaskGuidance("What is in this folder?", true), /current selected folder is authoritative/);
  assert.match(localTaskGuidance("Plot the CSV values", true), /align paired x\/y/);
  assert.match(localTaskGuidance("Continue", true, true), /align paired x\/y/);
});

test("only unambiguous conversation and folder inventories narrow the tool catalog", () => {
  assert.equal(isLocalConversationOnlyRequest("Tell me a short joke"), true);
  assert.equal(isLocalConversationOnlyRequest("Tell me a joke and save it to joke.md"), false);
  assert.equal(isLocalFolderInventoryRequest("What is in this folder?"), true);
  assert.equal(isLocalFolderInventoryRequest("List this folder"), true);
  assert.equal(isLocalFolderInventoryRequest("List this folder then rename the files"), false);
  assert.equal(isLocalFolderInventoryRequest("What is in this folder and my Knowledge notes?"), false);
});

const output = resolve(import.meta.dirname, "../node_modules/.cache/local-prompt-test");
await build({
  entry: { runtime: join(import.meta.dirname, "runtime.ts") }, outDir: output,
  format: ["cjs"], outExtension: () => ({ js: ".cjs" }), platform: "node", target: "node22",
  external: ["electron"], noExternal: ["@agent-commons/agent-core", "@agent-commons/desktop-contract", "@agent-commons/cli"],
  sourcemap: false, silent: true,
});
const load = Module._load;
let PrivateLocalRuntime;
try {
  Module._load = function (name, ...args) {
    if (name === "electron") return { safeStorage: { isEncryptionAvailable: () => false } };
    return load.call(this, name, ...args);
  };
  ({ PrivateLocalRuntime } = createRequire(import.meta.url)(join(output, "runtime.cjs")));
} finally { Module._load = load; }

for (const model of ["deepseek-r1:1.5b", "qwen3.5:2b"]) {
  test(`${model}: imported Copilot can greet, chat, inspect a folder and retrieve selected Knowledge within 16K`, async () => {
    const root = mkdtempSync(join(tmpdir(), "commons-local-prompt-"));
    const folder = join(root, "selected-folder");
    mkdirSync(folder); writeFileSync(join(folder, "project-plan-731.md"), "Real folder evidence.");
    mkdirSync(join(root, "private-local"));
    const notePath = join(root, "note.md");
    const note = "PrivateKnowledgeMarker731: the approved launch owner is Amina.";
    writeFileSync(notePath, note);
    const failures = [], requests = [];
    let folderReads = 0;
    const server = createServer(async (request, response) => {
      response.setHeader("Content-Type", "application/json");
      try {
        if (request.url === "/api/tags") return response.end(JSON.stringify({ models: [{ name: model }] }));
        let raw = ""; for await (const chunk of request) raw += chunk;
        const body = JSON.parse(raw);
        const messages = body.messages;
        if (messages[0].content.startsWith("Write a specific title")) return response.end(JSON.stringify({ message: { role: "assistant", content: "Local prompt test" } }));
        requests.push(body);
        assert.equal(body.options.num_ctx, 16_384);
        const estimatedTokens = Math.ceil(Buffer.byteLength(JSON.stringify(messages)) / 2) + (body.tools ? Math.ceil(JSON.stringify(body.tools).length / 2) : 0) + body.options.num_predict + 512;
        assert.ok(estimatedTokens <= 16_384, "The complete model request exceeded its context window");
        const selected = messages.some(message => message.content === "Find PrivateKnowledgeMarker731");
        assert.equal(messages[0].content.includes(note), selected, "Auto mode must not inject Knowledge text; explicit selection must retain relevant passages");
        assert.ok(!messages[0].content.includes("project-plan-731.md"), "The selected folder must be read through a tool, not injected as a snapshot");
        const last = messages.at(-1);
        const folderTask = messages.some(message => message.content === "What is in this folder?");
        const joke = messages.at(-1).content === "Tell me a joke";
        if (joke) assert.equal(body.tools, undefined, "Ordinary conversation must not load a tool catalog");
        if (folderTask && !selected && body.tools) assert.ok(body.tools.every(tool => /^cli_(?:list_directory|read_file|search_file|search_files|disk_usage)$/.test(tool.function.name)));
        const result = last.role === "tool" || last.content.startsWith("Tool result cli_list_directory:");
        let message = { role: "assistant", content: "Hello from Local." };
        if (folderTask && !selected) {
          if (result) {
            folderReads++;
            assert.match(last.content, /project-plan-731\.md/);
            message.content = "The folder contains project-plan-731.md.";
          } else if (body.tools) message = { role: "assistant", content: "", tool_calls: [{ function: { name: "cli_list_directory", arguments: { path: "." } } }] };
          else message.content = JSON.stringify({ tool: "cli_list_directory", args: { path: "." } });
        } else if (selected) message.content = "The approved launch owner is Amina.";
        if (!body.tools && body.format && (!folderTask || result || selected)) message.content = JSON.stringify({ tool: "final", args: { response: message.content } });
        response.end(JSON.stringify({ message, done: true }) + "\n");
      } catch (error) { failures.push(error); response.statusCode = 500; response.end(JSON.stringify({ error: error.message })); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const state = {
      version: 1, agents: [{ ...imported, model }], conversations: [], library: [], skills: [], tasks: [], workflows: [], apps: [],
      spaces: [{ id: "selected-notes", name: "Notes", folders: [], files: [{ path: notePath, excerpt: note, size: note.length, modifiedAt: "2026-01-01", format: "text" }], autoGrantNewAgents: true }],
      settings: { ollamaUrl: `http://127.0.0.1:${server.address().port}`, defaultModel: model, permissionMode: "ask", keepLocalModelWarm: false, webSearchDefaultEnabled: false },
    };
    writeFileSync(join(root, "private-local/state.bin"), JSON.stringify(state), { mode: 0o600 });
    const runtime = new PrivateLocalRuntime(root);
    try {
      const greeting = await runtime.sendMessage({ agentId: imported.id, prompt: "hello", knowledgeMode: "auto" });
      assert.equal(greeting.response, "Hello from Local.");
      const follow = await runtime.sendMessage({ agentId: imported.id, conversationId: greeting.conversation.id, prompt: "Tell me a joke" });
      assert.equal(follow.response, "Hello from Local.");
      const inspected = await runtime.sendMessage({ agentId: imported.id, conversationId: greeting.conversation.id, workspaceRoot: folder, prompt: "What is in this folder?" });
      assert.equal(inspected.response, "The folder contains project-plan-731.md.");
      assert.equal(folderReads, 1);
      const selected = await runtime.sendMessage({ agentId: imported.id, prompt: "Find PrivateKnowledgeMarker731", knowledgeMode: "selected", spaceIds: ["selected-notes"] });
      assert.equal(selected.response, "The approved launch owner is Amina.");
      assert.equal(runtime.state().agents[0].instructions, imported.instructions);
      assert.equal(requests.length, 4);
      assert.deepEqual(failures, []);
    } finally {
      runtime.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
      rmSync(root, { recursive: true, force: true });
    }
  });
}
