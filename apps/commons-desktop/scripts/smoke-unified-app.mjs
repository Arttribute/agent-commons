import electron from "electron";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { smokeLocalTools } from "./smoke-local-tools.mjs";

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

async function evaluate(wsUrl, expression, timeout = 5_000) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("Desktop DevTools did not connect")); }, 5_000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = (error) => { clearTimeout(timer); reject(error); };
    socket.onclose = () => { clearTimeout(timer); reject(new Error("Desktop DevTools closed before connecting")); };
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Desktop page did not respond")), timeout);
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
          await smokeLocalTools(evaluate, page.webSocketDebuggerUrl, temp);
          if (process.env.COMMONS_DESKTOP_STRESS_MODEL) {
            const workspace = join(temp, "stress-workspace");
            mkdirSync(workspace);
            writeFileSync(join(workspace, "sum.js"), "export function sum(a, b) { return a - b; }\n");
            if (process.env.COMMONS_DESKTOP_STRESS_PDF) copyFileSync(process.env.COMMONS_DESKTOP_STRESS_PDF, join(workspace, "report.pdf"));
            const stress = await evaluate(page.webSocketDebuggerUrl, `(async () => {
              const bridge = window.agentCommonsLocal;
              const commands = [];
              const unsubscribe = bridge.onEvent((event) => {
                if (event.type === 'approval') void bridge.approve(event.approval.id, true);
                if (event.type === 'activity' && event.toolName && event.status !== 'running') commands.push({ name: event.toolName, args: event.args, result: event.result });
              });
              try {
                await bridge.updateSettings({ defaultModel: ${JSON.stringify(process.env.COMMONS_DESKTOP_STRESS_MODEL)}, permissionMode: 'ask' });
                const agentId = (await bridge.getState()).agents.find(agent => agent.name === 'Commons Copilot').id;
                const code = await bridge.sendMessage({ agentId, workspaceRoot: ${JSON.stringify(workspace)}, prompt: 'Fix sum.js so sum(2, 3) is 5. Run a Node command to verify the fix, and report the observed result.' });
                const document = ${process.env.COMMONS_DESKTOP_STRESS_PDF ? `await bridge.sendMessage({ agentId, workspaceRoot: ${JSON.stringify(workspace)}, prompt: 'Read report.pdf and summarize its final recommendation in two sentences.' })` : 'null'};
                return { code: code.response, document: document?.response, commands };
              } finally { unsubscribe(); }
            })()`, 300_000);
            const updated = (await import("node:fs")).readFileSync(join(workspace, "sum.js"), "utf8");
            if (!updated.includes("a + b")) throw new Error(`Real model did not fix sum.js: ${JSON.stringify(stress)}`);
            if (!stress.commands.some((entry) => entry.name === "cli_run_command" && /(?:^|\D)5(?:\D|$)/.test(entry.result ?? "") && !/"exitCode":(?:[1-9]|null)/.test(entry.result ?? ""))) {
              throw new Error(`Real model did not verify the result: ${JSON.stringify(stress)}`);
            }
            if (process.env.COMMONS_DESKTOP_STRESS_PDF && !stress.document) throw new Error("Real model did not read the PDF");
            if (process.env.COMMONS_DESKTOP_STRESS_PDF && !stress.commands.some((entry) => entry.name === "cli_read_file" && entry.args?.path === "report.pdf")) {
              throw new Error(`Real model answered without reading the PDF: ${JSON.stringify(stress)}`);
            }
            console.log(`Real local model task passed: ${JSON.stringify(stress).slice(0, 800)}`);
          }
          const savedSession = await evaluate(page.webSocketDebuggerUrl, `(async () => {
            const bridge = window.agentCommonsLocal;
            const conversation = (await bridge.getState()).conversations[0];
            const result = await bridge.apiRequest({ path: '/api/sessions/' + conversation.id + '?full=true', method: 'GET' });
            return { id: conversation.id, agentName: (await bridge.getState()).agents.find(agent => agent.id === conversation.agentId).name, status: result.status, title: result.body?.data?.title, messages: result.body?.data?.history?.length };
          })()`);
          if (savedSession.status !== 200 || savedSession.messages < 2) throw new Error(`Local session was not stored: ${JSON.stringify(savedSession)}`);
          await evaluate(page.webSocketDebuggerUrl, `location.href = '/sessions/${savedSession.id}'`);
          let sessionVisible = false;
          for (let attempt = 0; attempt < 15; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const rendered = await evaluate(page.webSocketDebuggerUrl, "({path:location.pathname,body:document.body.innerText})").catch(() => null);
            if (rendered?.path === `/sessions/${savedSession.id}` && rendered.body.includes(savedSession.agentName) && !rendered.body.includes("Session not found")) {
              sessionVisible = true;
              break;
            }
          }
          if (!sessionVisible) throw new Error(`Saved Local session did not render: ${savedSession.id}`);
          const webSearchDialog = await evaluate(page.webSocketDebuggerUrl, `(async () => {
            const buttons = [...document.querySelectorAll('button[aria-label="Add photos & files"]')];
            buttons.find(button => !button.disabled)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
            await new Promise(resolve => setTimeout(resolve, 100));
            const item = [...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node => node.textContent?.includes('Web search'));
            if (!item || item.getAttribute('aria-disabled') === 'true') return { item: item?.outerHTML ?? null, path: location.pathname, buttons: buttons.map(button => button.outerHTML.slice(0, 450)), menus: [...document.querySelectorAll('[role="menu"]')].map(menu => menu.innerText.slice(0, 450)), body: document.body.innerText.slice(-500) };
            item.click();
            await new Promise(resolve => setTimeout(resolve, 100));
            return { open: !!document.querySelector('[role="dialog"] input[type="url"]'), path: location.pathname, item: item.outerHTML, dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.innerText.slice(0, 300)) };
          })()`);
          if (!webSearchDialog?.open || webSearchDialog.path !== `/sessions/${savedSession.id}`) throw new Error(`Web search did not open configuration inside the chat: ${JSON.stringify(webSearchDialog)}`);
          const webSearchConfigured = await evaluate(page.webSocketDebuggerUrl, `(async () => {
            const dialog = document.querySelector('[role="dialog"]');
            const input = dialog.querySelector('input[type="url"]');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'http://127.0.0.1:8585');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            dialog.querySelector('button[type="submit"]').click();
            for (let attempt = 0; attempt < 20; attempt += 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
              if ((await window.agentCommonsLocal.getState()).settings.webSearchUrl === 'http://127.0.0.1:8585' && !document.querySelector('[role="dialog"]')) return { pass: location.pathname === '/sessions/${savedSession.id}', path: location.pathname };
            }
            return { pass: false, path: location.pathname, endpoint: (await window.agentCommonsLocal.getState()).settings.webSearchUrl, dialog: document.querySelector('[role="dialog"]')?.innerText.slice(0, 500) };
          })()`);
          if (!webSearchConfigured?.pass) throw new Error(`Web search could not be saved and turned on from chat: ${JSON.stringify(webSearchConfigured)}`);
          const webSearchChecked = await evaluate(page.webSocketDebuggerUrl, `(async () => {
            document.querySelector('button[aria-label="Add photos & files"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
            await new Promise(resolve => setTimeout(resolve, 100));
            const item = [...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node => node.textContent?.includes('Web search'));
            return item?.getAttribute('aria-checked') === 'true';
          })()`);
          if (!webSearchChecked) throw new Error("Web search was not enabled in the chat after setup");
          await evaluate(page.webSocketDebuggerUrl, "window.dispatchEvent(new CustomEvent('agent-computer-open', { detail: { tab: 'browser' } }))");
          let computerVisible = false;
          for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const panel = await evaluate(page.webSocketDebuggerUrl, "({ text: document.body.innerText, native: typeof window.agentCommonsLocal.openComputer === 'function' })");
            if (panel.native && panel.text.includes('This computer') && panel.text.includes('Open terminal') && !panel.text.includes('Cloud APIs are unavailable')) { computerVisible = true; break; }
          }
          if (!computerVisible) throw new Error("Local Computer panel did not route to native windows");
          await evaluate(page.webSocketDebuggerUrl, "window.agentCommonsLocal.openCloud('/studio/agents')");
          const cloudPages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
          const cloudPage = cloudPages.find((item) => item.type === "page" && item.url.startsWith("http://localhost:"));
          if (!cloudPage || cloudPage.id !== page.id) throw new Error("Changing modes replaced the Commons renderer");
          const access = await evaluate(cloudPage.webSocketDebuggerUrl, "window.agentCommonsDesktop.getAccess()");
          if (access?.runCommands !== false || access?.readFiles !== true) throw new Error(`Unexpected Cloud desktop access: ${JSON.stringify(access)}`);
          const restricted = await evaluate(cloudPage.webSocketDebuggerUrl,
            "window.agentCommonsDesktop.updateAccess({readFiles:false,writeFiles:false,runCommands:false})");
          if (restricted?.readFiles !== false || restricted?.writeFiles !== false || restricted?.runCommands !== false) {
            throw new Error(`Could not restrict Cloud desktop access: ${JSON.stringify(restricted)}`);
          }
          await evaluate(cloudPage.webSocketDebuggerUrl, "window.agentCommonsDesktop.openPrivateWorkspace('/studio/agents')");
          const localAgain = await evaluate(cloudPage.webSocketDebuggerUrl, "window.agentCommonsLocal.getInfo()");
          if (localAgain?.mode !== "private-local") throw new Error("Could not return to the Local workspace in the same renderer");
          const restored = await evaluate(cloudPage.webSocketDebuggerUrl, "window.agentCommonsLocal.getState()");
          if (!restored?.conversations?.some((conversation) => conversation.id === savedSession.id)) {
            throw new Error("Saved Local session disappeared after switching modes");
          }
          console.log(`Unified Commons desktop loaded ${result.path} with Local agent and both mode bridges.`);
          ready = true;
          break;
        }
      }
    } catch (error) {
      if (error.message !== lastError?.message) console.error(`Desktop smoke check: ${error.message}`);
      lastError = error;
    }
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
