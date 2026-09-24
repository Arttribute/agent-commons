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
const env = { ...process.env, COMMONS_DESKTOP_START_MODE: "private-local" };
delete env.ELECTRON_RUN_AS_NODE;
const packagedExecutable = process.env.COMMONS_DESKTOP_SMOKE_EXECUTABLE;
const child = spawn(packagedExecutable || electron, [
  ...(packagedExecutable ? [] : ["."]),
  `--user-data-dir=${temp}`,
  `--remote-debugging-port=${port}`,
  ...(process.platform === "linux" ? ["--no-sandbox"] : []),
], { cwd: new URL("..", import.meta.url), env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + chunk.toString()).slice(-6_000); });

async function evaluate(wsUrl, expression) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
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
  const deadline = Date.now() + 60_000;
  let ready = false;
  let lastError;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) })).json();
      const page = pages.find((item) => item.type === "page" && item.url.startsWith("http://localhost:"));
      if (page) {
        const result = await evaluate(page.webSocketDebuggerUrl,
          "({path:location.pathname,local:document.cookie.includes('commons-desktop-mode=private-local'),bridge:!!window.agentCommonsLocal,cloudBridge:!!window.agentCommonsDesktop,agents:document.body.innerText.includes('Commons Copilot')})");
        if (result?.local && result.bridge && result.cloudBridge && result.agents) {
          const provider = await evaluate(page.webSocketDebuggerUrl, `(async () => {
            const api = window.agentCommonsLocal.apiRequest;
            const [knowledge, library, skills] = await Promise.all([
              api({ path: "/api/knowledge", method: "GET" }),
              api({ path: "/api/library", method: "GET" }),
              api({ path: "/api/skills", method: "GET" }),
            ]);
            return { knowledge: knowledge.status, library: library.status, skills: skills.status };
          })()`);
          if (provider.knowledge !== 200 || provider.library !== 200 || provider.skills !== 200) {
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
  if (!ready) throw new Error(`Unified Commons desktop did not pass its checks within 60 seconds. ${lastError?.message ?? ""}\n${output}`);
} finally {
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
  rmSync(temp, { recursive: true, force: true });
}
