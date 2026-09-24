import electron from "electron";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const temp = mkdtempSync(join(tmpdir(), "commons-desktop-smoke-"));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const env = { ...process.env, COMMONS_DESKTOP_START_MODE: "private-local", COMMONS_DESKTOP_SMOKE_DEBUG: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const packagedExecutable = process.env.COMMONS_DESKTOP_SMOKE_EXECUTABLE;
const child = spawn(packagedExecutable || electron, [
  ...(packagedExecutable ? [] : ["."]),
  `--user-data-dir=${temp}`,
  `--remote-debugging-port=${port}`,
  ...(process.platform === "linux" ? ["--no-sandbox"] : []),
], { cwd: new URL("..", import.meta.url), env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
let childError = "";
child.on("error", (error) => { childError = error.message; });
for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + chunk.toString()).slice(-6_000); });

async function evaluate(wsUrl, expression) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("Desktop DevTools did not connect")); }, 5_000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = (error) => { clearTimeout(timer); reject(error); };
    socket.onclose = () => { clearTimeout(timer); reject(new Error("Desktop DevTools closed before connecting")); };
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Desktop page did not respond")), 5_000);
      socket.onmessage = (event) => {
        const packet = JSON.parse(event.data);
        if (packet.id !== 1) return;
        clearTimeout(timer);
        if (packet.result?.exceptionDetails || packet.error) reject(new Error(JSON.stringify(packet.result?.exceptionDetails ?? packet.error)));
        else resolve(packet.result?.result?.value);
      };
      socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  } finally { socket.close(); }
}

try {
  const deadline = Date.now() + 90_000;
  let ready = false;
  let lastError;
  let lastTargets = "";
  let lastResult;
  let lastPage;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) })).json();
      lastTargets = pages.map((item) => `${item.type}: ${item.url}`).join("; ").slice(0, 1_500);
      const page = pages.find((item) => item.type === "page" && item.url.startsWith("http://localhost:"));
      if (page) {
        lastPage = page;
        const result = await evaluate(page.webSocketDebuggerUrl,
          "({path:location.pathname,local:document.cookie.includes('commons-desktop-mode=private-local'),bridge:!!window.agentCommonsLocal,cloudBridge:!!window.agentCommonsDesktop,agents:document.body.textContent?.includes('Commons Copilot'),body:document.body.innerText.slice(0,600),text:document.body.textContent?.slice(0,600),readyState:document.readyState,htmlLength:document.documentElement.outerHTML.length,htmlEnd:document.documentElement.outerHTML.slice(-450),scripts:[...document.querySelectorAll('script[src]')].slice(0,8).map(s=>s.src),resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/_next/')).slice(-12).map(r=>({name:r.name.split('/').slice(-1)[0],duration:r.duration,size:r.transferSize}))})");
        lastResult = result;
        if (result?.local && result.bridge && result.cloudBridge && result.agents) {
          const provider = await evaluate(page.webSocketDebuggerUrl, `(async () => {
            const api = window.agentCommonsLocal.apiRequest;
            const [knowledge, library, skills, tools] = await Promise.all([
              api({ path: "/api/knowledge", method: "GET" }),
              api({ path: "/api/library", method: "GET" }),
              api({ path: "/api/skills", method: "GET" }),
              api({ path: "/api/tools/catalog", method: "GET" }),
            ]);
            return { knowledge: knowledge.status, library: library.status, skills: skills.status,
              tools: tools.status, commandTool: tools.body?.items?.some((item) => item.name === "cli_run_command") };
          })()`);
          if (provider.knowledge !== 200 || provider.library !== 200 || provider.skills !== 200 || provider.tools !== 200 || !provider.commandTool) {
            throw new Error(`Local data providers failed: ${JSON.stringify(provider)}`);
          }
          const identities = await evaluate(page.webSocketDebuggerUrl, `(async () => {
            const bridge = window.agentCommonsLocal;
            const agent = (await bridge.getState()).agents.find((item) => item.name === "Commons Copilot");
            if (!agent) throw new Error("Commons Copilot is missing from Local agents");
            const copilot = (await bridge.sendMessage({ agentId: agent.id, prompt: "What is your name?" })).response;
            const state = await bridge.saveAgent({ name: "Research Agent", instructions: "Research carefully.", model: "" });
            const researcher = state.agents.find((item) => item.name === "Research Agent");
            if (!researcher) throw new Error("Could not create a Local agent");
            const research = (await bridge.sendMessage({ agentId: researcher.id, prompt: "What is your name?" })).response;
            return { copilot, research };
          })()`);
          if (identities?.copilot !== "My name is Commons Copilot." || identities?.research !== "My name is Research Agent.") {
            throw new Error(`Local agent identity failed: ${JSON.stringify(identities)}`);
          }
          console.log(`Unified Commons desktop loaded ${result.path} with Local agent and both mode bridges.`);
          ready = true;
          break;
        }
      }
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  let diagnostics;
  if (!ready && lastPage) {
    try {
      diagnostics = await evaluate(lastPage.webSocketDebuggerUrl,
        "({htmlLength:document.documentElement.outerHTML.length,htmlEnd:document.documentElement.outerHTML.slice(-1200),scripts:[...document.scripts].filter(s=>s.src).slice(0,12).map(s=>s.src),resources:performance.getEntriesByType('resource').slice(-20).map(r=>({name:r.name,duration:r.duration,size:r.transferSize})),errors:document.querySelectorAll('nextjs-portal').length})");
    } catch (error) { diagnostics = error.message; }
  }
  if (!ready) throw new Error(`Unified Commons desktop did not pass its checks within 90 seconds. ${lastError?.message ?? ""} Child: ${childError || child.exitCode} Targets: ${lastTargets} Page: ${JSON.stringify(lastResult)} Diagnostics: ${JSON.stringify(diagnostics)}\n${output}`);
} finally {
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
  try {
    rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    // A packaged Electron helper can still be writing its profile after the
    // parent exits. Preserve the original smoke failure for diagnosis.
    console.warn(`Could not remove smoke profile ${temp}: ${error.message}`);
  }
}
