import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Runs the packaged bridge, runtime, real processes and persistence against a
// deterministic loopback model. No user's model or workspace is changed.
export async function smokeLocalTools(evaluate, wsUrl, root) {
  const workspace = join(root, "tool-workspace");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, "launch.md"), "Mango launch owner: Amina. Launch code: mango-731.");
  const failures = [];
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/tags") return response.end(JSON.stringify({ models: [{ name: "commons-smoke" }] }));
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      assert.ok(body.options.num_ctx >= 16_384);
      const messages = body.messages;
      const last = messages.at(-1);
      const prompt = [...messages].reverse().find((message) => message.role === "user").content;
      let answer = { role: "assistant", content: "" };
      const call = (name, args) => ({ role: "assistant", content: "", thinking: "Continue the current task", tool_calls: [{ function: { name, arguments: args } }] });
      if (last.role === "tool") {
        assert.ok(last.tool_name, "tool result is missing its name");
        assert.equal(messages.at(-2).thinking, "Continue the current task");
        assert.equal(messages.at(-2).tool_calls[0].function.name, last.tool_name);
      }
      if (prompt === "Run the smoke command") {
        if (last.role === "user") answer = call("cli_run_command", { command: JSON.stringify(process.execPath) + " -e", args: ["-e", "console.log('mango-731')"] });
        else { assert.match(last.content, /mango-731/); answer.content = "Command returned mango-731."; }
      } else if (prompt === "Remember the command result") {
        assert.ok(messages.some((message) => message.role === "tool" && message.tool_name === "cli_run_command" && message.content.includes("mango-731")), "saved tool history was lost on follow-up");
        answer.content = "The previous output was mango-731.";
      } else if (prompt === "Run a failing smoke command") {
        if (last.role === "user") answer = call("cli_run_command", { command: process.execPath, args: ["-e", "console.error('failure-731'); process.exit(3)"] });
        else { assert.match(last.content, /^Error:[\s\S]*failure-731/); answer.content = "Command failed with failure-731."; }
      } else if (prompt === "Start and finish the smoke process") {
        if (last.role === "user") answer = call("cli_start_process", { command: process.execPath, args: ["-e", "setTimeout(() => console.log('process-731'), 50)"] });
        else {
          const result = JSON.parse(last.content);
          if (last.tool_name === "cli_start_process" || result.status === "running") answer = call("cli_wait_for_process", { processId: result.processId, wait_seconds: 1 });
          else { assert.equal(result.status, "done"); assert.match(result.stdout, /process-731/); answer.content = "Process completed with process-731."; }
        }
      } else if (prompt === "Read the smoke knowledge") {
        if (last.role === "user") answer = call("list_knowledge_spaces", {});
        else if (last.tool_name === "list_knowledge_spaces") {
          const space = JSON.parse(last.content).find((space) => space.name === "Smoke notes");
          assert.ok(space); answer = call("list_knowledge_documents", { spaceId: space.spaceId });
        } else if (last.tool_name === "list_knowledge_documents") {
          const result = JSON.parse(last.content);
          answer = call("read_knowledge_document", { spaceId: result.spaceId, path: result.documents[0].path });
        } else { assert.match(last.content, /Amina/); answer.content = "Mango launch owner: Amina."; }
      } else throw new Error(`Unexpected smoke prompt: ${prompt}`);
      response.end(JSON.stringify({ message: answer, done: true }) + "\n");
    } catch (error) { failures.push(error); response.statusCode = 500; response.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const result = await evaluate(wsUrl, `(async () => {
      const bridge = window.agentCommonsLocal;
      const state = await bridge.getState();
      const agentId = state.agents.find((agent) => agent.name === 'Commons Copilot').id;
      const originalSettings = state.settings;
      const unsubscribe = bridge.onEvent(event => { if (event.type === 'approval') void bridge.approve(event.approval.id, true); });
      try {
        await bridge.updateSettings({ ollamaUrl: ${JSON.stringify(url)}, defaultModel: 'commons-smoke' });
        const first = await bridge.sendMessage({ agentId, workspaceRoot: ${JSON.stringify(workspace)}, prompt: 'Run the smoke command' });
        const follow = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Remember the command result' });
        const failure = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Run a failing smoke command' });
        const process = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Start and finish the smoke process' });
        await bridge.addKnowledgeSpace('Smoke notes', [${JSON.stringify(workspace)}]);
        const knowledge = await bridge.sendMessage({ agentId, prompt: 'Read the smoke knowledge' });
        return { first: first.response, follow: follow.response, failure: failure.response, process: process.response, knowledge: knowledge.response };
      } finally { unsubscribe(); await bridge.updateSettings(originalSettings); }
    })()`, 30_000);
    assert.deepEqual(result, { first: "Command returned mango-731.", follow: "The previous output was mango-731.", failure: "Command failed with failure-731.", process: "Process completed with process-731.", knowledge: "Mango launch owner: Amina." });
    assert.deepEqual(failures, []);
    console.log("Local command, process polling, saved tool history and Knowledge reading passed.");
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
