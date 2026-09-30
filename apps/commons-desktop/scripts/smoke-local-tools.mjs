import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Runs the packaged bridge, runtime, real processes and persistence against a
// deterministic loopback model. No user's model or workspace is changed.
export async function smokeLocalTools(evaluate, wsUrl, root) {
  const workspace = join(root, "tool-workspace");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(join(workspace, "app"), { recursive: true });
  writeFileSync(join(workspace, "launch.md"), "Mango launch owner: Amina. Launch code: mango-731.");
  writeFileSync(join(workspace, "app", "page.tsx"), "export default function Page() { return <main>Shoes for everyone</main>; }");
  writeFileSync(join(workspace, "long-report.txt"), `${"Background evidence without conclusions. ".repeat(2_000)}\nFinal recommendation: Keep an offline backup of the research notes.`);
  const failures = [];
  let mcpReadCalls = 0;
  let mcpWriteCalls = 0;
  let webSearchCalls = 0;
  let downloadedModel = false;
  const mcp = new McpServer({ name: "commons-smoke-mcp", version: "1.0.0" });
  mcp.registerTool("read_mango", { description: "Read the launch code", annotations: { readOnlyHint: true } }, async () => {
    mcpReadCalls += 1;
    return { content: [{ type: "text", text: "mango-731" }] };
  });
  mcp.registerTool("write_mango", { description: "Change the launch code", annotations: { readOnlyHint: false, destructiveHint: true } }, async () => {
    mcpWriteCalls += 1;
    return { content: [{ type: "text", text: "changed" }] };
  });
  const mcpTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
  await mcp.connect(mcpTransport);
  const mcpServer = createServer((request, response) => {
    void mcpTransport.handleRequest(request, response).catch((error) => { failures.push(error); response.writeHead(500); response.end(); });
  });
  await new Promise((resolve) => mcpServer.listen(0, "127.0.0.1", resolve));
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url?.startsWith("/searx/search?")) {
      const query = new URL(request.url, "http://127.0.0.1").searchParams.get("q");
      assert.equal(query, "mango evidence");
      assert.equal(request.headers["x-agent-commons-search-key"], "smoke-key");
      webSearchCalls += 1;
      return response.end(JSON.stringify({ results: [{ title: "Mango research", url: "https://example.org/mango", content: "Mango evidence found." }] }));
    }
    if (request.url === "/api/tags") return response.end(JSON.stringify({ models: [{ name: "commons-smoke" }, ...(downloadedModel ? [{ name: "qwen3:1.7b" }] : [])] }));
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      if (request.url === "/api/pull") {
        assert.equal(body.name, "qwen3:1.7b");
        downloadedModel = true;
        return response.end('{"status":"pulling manifest"}\n{"status":"downloading","completed":5,"total":10}\n{"status":"success"}\n');
      }
      if (body.messages?.[0]?.content?.startsWith("Write a specific title")) {
        assert.equal(body.stream, false);
        return response.end(JSON.stringify({ message: { role: "assistant", content: "Mango workspace task" } }));
      }
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
      } else if (prompt === "Read the project page") {
        if (last.role === "user") answer = call("cli_read_file", { path: "app/page.tsx" });
        else { assert.match(last.content, /Shoes for everyone/); answer.content = "The project page sells shoes."; }
      } else if (prompt === "Read the project page by absolute path") {
        if (last.role === "user") answer = call("cli_read_file", { path: join(workspace, "app/page.tsx") });
        else { assert.match(last.content, /Shoes for everyone/); answer.content = "The absolute workspace path works."; }
      } else if (prompt === "Check git command") {
        if (last.role === "user") answer = call("cli_run_command", { command: "git", args: ["--version"] });
        else { assert.match(last.content, /git version/i); answer.content = "Git works in the desktop app."; }
      } else if (prompt === "Find the report recommendation") {
        if (last.role === "user") {
          assert.ok(body.tools.some((tool) => tool.function.name === "cli_search_file"));
          answer = call("cli_search_file", { path: "long-report.txt", query: "final recommendation" });
        } else if (last.tool_name === "cli_search_file") {
          const search = JSON.parse(last.content);
          assert.ok(search.totalChars > 70_000);
          assert.match(search.matches[0].excerpt, /offline backup/);
          answer = call("cli_read_file", { path: "long-report.txt", offset: search.matches[0].offset });
        } else { assert.match(last.content, /offline backup/); answer.content = "The report recommends an offline backup."; }
      } else if (prompt === "Find the attached report recommendation") {
        if (last.role === "user") {
          assert.ok(body.tools.some((tool) => tool.function.name === "search_library_item"));
          const itemId = messages.find((message) => message.role === "system")?.content.match(/itemId: ([\w-]+)/)?.[1];
          assert.ok(itemId, "attached Library item ID was not available to the agent");
          answer = call("search_library_item", { itemId, query: "final recommendation" });
        } else if (last.tool_name === "search_library_item") {
          const search = JSON.parse(last.content);
          assert.ok(search.totalChars > 70_000);
          assert.match(search.matches[0].excerpt, /offline backup/);
          answer = call("read_library_item", { itemId: search.itemId, offset: search.matches[0].offset });
        } else { assert.match(last.content, /offline backup/); answer.content = "The attached report recommends an offline backup."; }
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
      } else if (prompt === "Stop the smoke process") {
        if (last.role === "user") answer = call("cli_start_process", { command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"] });
        else {
          const result = JSON.parse(last.content);
          if (last.tool_name === "cli_start_process") answer = call("cli_kill_process", { processId: result.processId });
          else if (last.tool_name === "cli_kill_process") answer = call("cli_process_status", { processId: result.processId });
          else { assert.equal(result.status, "killed"); answer.content = "Process stopped cleanly."; }
        }
      } else if (prompt === "Read the smoke knowledge") {
        if (last.role === "user") answer = call("list_knowledge_spaces", {});
        else if (last.tool_name === "list_knowledge_spaces") {
          const space = JSON.parse(last.content).find((space) => space.name === "Smoke notes");
          assert.ok(space); answer = call("list_knowledge_documents", { spaceId: space.spaceId });
        } else if (last.tool_name === "list_knowledge_documents") {
          const result = JSON.parse(last.content);
          const note = result.documents.find((document) => document.path.endsWith("launch.md"));
          assert.ok(note, "launch note was not indexed");
          answer = call("read_knowledge_document", { spaceId: result.spaceId, path: note.path });
        } else { assert.match(last.content, /Amina/); answer.content = "Mango launch owner: Amina."; }
      } else if (prompt === "Start slowly") {
        await new Promise((resolve) => setTimeout(resolve, 350));
        answer.content = "Original direction.";
      } else if (prompt === "Focus on mango instead") {
        answer.content = "Focused on mango.";
      } else if (prompt === "Read from MCP") {
        assert.ok(body.tools.some((tool) => tool.function.name === "mcp_0_read_mango"));
        assert.ok(!body.tools.some((tool) => tool.function.name === "mcp_0_write_mango"), "write tool leaked into read mode");
        if (last.role === "user") answer = call("mcp_0_read_mango", {});
        else { assert.match(last.content, /mango-731/); answer.content = "MCP read returned mango-731."; }
      } else if (prompt === "Search is off") {
        assert.ok(!body.tools.some((tool) => tool.function.name === "web_search"), "Web search was offered without chat consent");
        answer.content = "Web search is off.";
      } else if (prompt === "Search for mango evidence") {
        assert.ok(body.tools.some((tool) => tool.function.name === "web_search"), "Web search was not offered after chat consent");
        if (last.role === "user") answer = call("web_search", { query: "mango evidence" });
        else { assert.match(last.content, /Mango evidence found/); answer.content = "Web search found mango evidence."; }
      } else if (prompt === "Revoke search before approval") {
        if (last.role === "user") {
          assert.ok(body.tools.some((tool) => tool.function.name === "web_search"), "Web search was not offered before revocation");
          answer = call("web_search", { query: "mango evidence" });
        } else {
          assert.ok(!body.tools.some((tool) => tool.function.name === "web_search"), "Web search remained available after revocation");
          assert.match(last.content, /turned off before the query was sent/);
          answer.content = "Web search stopped before sending.";
        }
      } else throw new Error(`Unexpected smoke prompt: ${prompt}`);
      response.end(JSON.stringify({ message: answer, done: true }) + "\n");
    } catch (error) { failures.push(error); response.statusCode = 500; response.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const mcpUrl = `http://127.0.0.1:${mcpServer.address().port}/mcp`;
    const result = await evaluate(wsUrl, `(async () => {
      const bridge = window.agentCommonsLocal;
      const state = await bridge.getState();
      const agentId = state.agents.find((agent) => agent.name === 'Commons Copilot').id;
      const originalSettings = state.settings;
      let revokeNextSearch = false;
      const mcpConnectionErrors = [];
      const unsubscribe = bridge.onEvent(event => {
        if (event.type === 'activity' && event.label?.includes('could not connect')) mcpConnectionErrors.push(event.detail);
        if (event.type !== 'approval') return;
        if (event.approval.permission === 'web_search' && revokeNextSearch) {
          revokeNextSearch = false;
          void bridge.setConversationWebSearch(event.approval.conversationId, false).then(() => bridge.approve(event.approval.id, true));
        } else void bridge.approve(event.approval.id, true);
      });
      try {
        await bridge.updateSettings({ ollamaUrl: ${JSON.stringify(url)}, defaultModel: 'commons-smoke' });
        const first = await bridge.sendMessage({ agentId, workspaceRoot: ${JSON.stringify(workspace)}, prompt: 'Run the smoke command' });
        const follow = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Remember the command result' });
        const projectPage = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Read the project page' });
        const absolutePage = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Read the project page by absolute path' });
        const git = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Check git command' });
        const searched = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Find the report recommendation' });
        const upload = await bridge.apiRequest({ path: '/api/files/upload', method: 'POST', body: { files: [{ name: 'attached-report.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode('Background evidence without conclusions. '.repeat(2_000) + '\\nFinal recommendation: Keep an offline backup of the research notes.') }] } });
        if (upload.status !== 200 || !upload.body?.data?.[0]?.itemId) throw new Error('Could not upload a large Local Library fixture');
        const attached = await bridge.sendMessage({ agentId, prompt: 'Find the attached report recommendation', attachmentIds: [upload.body.data[0].itemId] });
        const failure = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Run a failing smoke command' });
        const process = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Start and finish the smoke process' });
        const stopped = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Stop the smoke process' });
        const started = new Promise((resolve) => {
          const stop = bridge.onEvent(event => { if (event.type === 'chat-start' && event.conversationId === first.conversation.id) { stop(); resolve(); } });
        });
        const steeringRun = bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Start slowly', interactive: true });
        await started;
        await bridge.steerConversation(first.conversation.id, 'Focus on mango instead');
        const steered = await steeringRun;
        await bridge.addKnowledgeSpace('Smoke notes', [${JSON.stringify(workspace)}]);
        const knowledge = await bridge.sendMessage({ agentId, prompt: 'Read the smoke knowledge' });
        await bridge.downloadModel('qwen3:1.7b');
        if (!(await bridge.listModels()).includes('qwen3:1.7b')) throw new Error('Downloaded model not found');
        await bridge.updateSettings({ defaultModel: 'qwen3:1.7b' });
        if ((await bridge.getState()).settings.defaultModel !== 'qwen3:1.7b') throw new Error('Downloaded model was not selected');
        await bridge.updateSettings({ mcpServers: [{ id: 'smoke', name: 'Smoke MCP', url: ${JSON.stringify(mcpUrl)}, mode: 'read', enabled: true }] });
        const mcp = await bridge.sendMessage({ agentId, prompt: 'Read from MCP', mcpServerIds: ['smoke'] }).catch(error => { throw new Error(String(error) + '; MCP connection: ' + mcpConnectionErrors.join(' | ')); });
        await bridge.updateSettings({ webSearchUrl: ${JSON.stringify(`${url}/searx`)}, webSearchApiKey: 'smoke-key' });
        const searchOff = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Search is off', webSearchEnabled: false });
        const searchOn = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Search for mango evidence', webSearchEnabled: true });
        if (!(await bridge.getState()).conversations.find(item => item.id === first.conversation.id)?.webSearchEnabled) throw new Error('Web search selection was not saved with the chat');
        revokeNextSearch = true;
        const revoked = await bridge.sendMessage({ agentId, conversationId: first.conversation.id, prompt: 'Revoke search before approval', webSearchEnabled: true });
        await bridge.updateSettings({ webSearchUrl: ${JSON.stringify(`${url}/other`)} });
        if ((await bridge.getState()).settings.webSearchApiKey) throw new Error('Search API key was carried to a different endpoint');
        return { first: first.response, follow: follow.response, projectPage: projectPage.response, absolutePage: absolutePage.response, git: git.response, searched: searched.response, attached: attached.response, failure: failure.response, process: process.response, stopped: stopped.response, steered: steered.response, knowledge: knowledge.response, mcp: mcp.response, searchOff: searchOff.response, searchOn: searchOn.response, revoked: revoked.response };
      } finally { unsubscribe(); await bridge.updateSettings({ ...originalSettings, webSearchUrl: originalSettings.webSearchUrl ?? '', webSearchApiKey: originalSettings.webSearchApiKey ?? '', mcpServers: originalSettings.mcpServers ?? [] }); }
    })()`, 30_000);
    assert.deepEqual(result, { first: "Command returned mango-731.", follow: "The previous output was mango-731.", projectPage: "The project page sells shoes.", absolutePage: "The absolute workspace path works.", git: "Git works in the desktop app.", searched: "The report recommends an offline backup.", attached: "The attached report recommends an offline backup.", failure: "Command failed with failure-731.", process: "Process completed with process-731.", stopped: "Process stopped cleanly.", steered: "Focused on mango.", knowledge: "Mango launch owner: Amina.", mcp: "MCP read returned mango-731.", searchOff: "Web search is off.", searchOn: "Web search found mango evidence.", revoked: "Web search stopped before sending." });
    assert.equal(mcpReadCalls, 1);
    assert.equal(mcpWriteCalls, 0);
    assert.equal(webSearchCalls, 1);
    assert.deepEqual(failures, []);
    console.log("Local command, steering, Knowledge, Web search and read-only MCP passed.");
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}; MCP server errors: ${failures.map((failure) => failure instanceof Error ? failure.stack : String(failure)).join(" | ")}`);
  } finally {
    server.closeAllConnections();
    mcpServer.closeAllConnections();
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => mcpServer.close(resolve))]);
    await mcp.close();
  }
}
