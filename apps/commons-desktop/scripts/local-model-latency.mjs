import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
const repo = resolve(import.meta.dirname, "../../..");
const require = createRequire(join(repo, "apps/commons-desktop/package.json"));
const { build } = require("tsup");
const out = join(
  repo,
  "apps/commons-desktop/node_modules/.cache/latency-probe",
);
await build({
  entry: { runtime: join(repo, "apps/commons-desktop/src/runtime.ts") },
  outDir: out,
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  platform: "node",
  target: "node22",
  external: ["electron"],
  noExternal: ["@agent-commons/agent-core", "@agent-commons/desktop-contract"],
  silent: true,
});
const { PrivateLocalRuntime } = require(join(out, "runtime.cjs"));
const root =
  process.env.COMMONS_SESSION_TEST_ROOT ||
  mkdtempSync(join(tmpdir(), "commons-local-latency-"));
mkdirSync(root, { recursive: true });
const label = "acceptance";
const model = process.env.COMMONS_LATENCY_MODEL || "qwen3.5:2b-q4_K_M";
const ps = await fetch("http://127.0.0.1:11434/api/ps").then((r) => r.json());
assert.equal(
  ps.models?.length || 0,
  0,
  "Run this benchmark on an idle test Ollama; another application already has a resident model.",
);
const runtime = new PrivateLocalRuntime(join(root, "latency-" + label));
const state = runtime.saveAgent({
  name: "Latency acceptance",
  model,
  instructions:
    "Be concise and help the user complete tasks with the available tools.",
});
const agentId = state.agents.at(-1).id;
const results = [];
let started = 0,
  firstToken;
runtime.setTarget({
  isDestroyed: () => false,
  send: (_channel, event) => {
    if (
      event.type === "chat-token" &&
      event.content &&
      firstToken === undefined
    )
      firstToken = performance.now() - started;
  },
});
const realFetch = globalThis.fetch;
try {
  for (const mode of ["cold", "preloaded"]) {
    await realFetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
    if (mode === "preloaded") {
      const warmStarted = performance.now();
      await realFetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        body: JSON.stringify({
          model,
          prompt: "",
          stream: false,
          keep_alive: "5m",
          options: { num_ctx: 16384 },
        }),
      }).then((r) => r.json());
      console.log(
        JSON.stringify({ preloadMs: performance.now() - warmStarted }),
      );
    }
    firstToken = undefined;
    started = performance.now();
    const result = await runtime.sendMessage({
      agentId,
      prompt: "Hello!",
      workspaceRoot: null,
      knowledgeMode: "off",
      webSearchEnabled: false,
      interactive: true,
    });
    const totalMs = performance.now() - started;
    await new Promise((r) => setTimeout(r, 25));
    results.push({
      model,
      mode,
      firstTokenMs: firstToken,
      totalMs,
      response: result.response,
    });
    console.log(JSON.stringify(results.at(-1)));
  }
  assert.ok(
    results.every((r) => Number.isFinite(r.firstTokenMs) && r.response.trim()),
    "Both cold and preloaded chats must produce an actual first token",
  );
  writeFileSync(
    join(root, "latency-" + label + ".json"),
    JSON.stringify(results, null, 2),
  );
  console.log("Evidence saved in " + root);
} finally {
  runtime.close();
  await realFetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({ model, keep_alive: 0 }),
  });
}
