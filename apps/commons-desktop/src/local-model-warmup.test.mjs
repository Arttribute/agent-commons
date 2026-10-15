import assert from "node:assert/strict";
import test from "node:test";
import { build } from "tsup";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
const output = resolve(
  import.meta.dirname,
  "../node_modules/.cache/warmup-test",
);
await build({
  entry: { warmup: join(import.meta.dirname, "local-model-warmup.ts"), model: join(import.meta.dirname, "local-model.ts") },
  outDir: output,
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  platform: "node",
  target: "node22",
  silent: true,
});
const { LocalModelWarmup, isOpeningGreeting } = createRequire(import.meta.url)(
  join(output, "warmup.cjs"),
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const target = { endpoint: "http://127.0.0.1:11434", model: "selected:latest" };
const setup = (models = [{ name: target.model }]) => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(url.endsWith("/api/tags") ? { models } : { done: true }),
    );
  };
  return { calls, warmup: new LocalModelWarmup(request, 1, async () => false) };
};
test("preloads only the latest selected installed model using chat context and bounded idle time", async () => {
  const { calls, warmup } = setup();
  warmup.schedule({ ...target, model: "previous:latest" });
  warmup.schedule(target);
  await sleep(20);
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    model: target.model,
    prompt: "",
    stream: false,
    keep_alive: "5m",
    options: { num_ctx: 16384 },
  });
  warmup.close();
});
test("missing models and unreviewed defaults are never downloaded or loaded", async () => {
  for (const models of [[], [{ name: "qwen3.5:2b", digest: "unexpected" }]]) {
    const { calls, warmup } = setup(models);
    warmup.schedule({
      ...target,
      model: models.length ? "qwen3.5:2b" : target.model,
    });
    await sleep(20);
    assert.equal(calls.length, 1);
    warmup.close();
  }
});
test("foreground work cancels a scheduled load and suppresses new background work until all tasks finish", async () => {
  const { calls, warmup } = setup();
  warmup.schedule(target);
  const first = warmup.beginForeground(),
    second = warmup.beginForeground();
  first();
  first();
  warmup.schedule(target);
  await sleep(15);
  assert.equal(calls.length, 0);
  second();
  warmup.schedule(target);
  await sleep(15);
  assert.equal(calls.length, 3);
  warmup.close();
});
test("account or mode changes cancel an in-flight lookup before it can load a model", async () => {
  let signal,
    loads = 0;
  const warmup = new LocalModelWarmup(
    async (url, options) => {
      if (url.endsWith("/api/tags")) {
        signal = options.signal;
        await sleep(15);
        return new Response(
          JSON.stringify({ models: [{ name: target.model }] }),
        );
      }
      loads++;
      return new Response("{}");
    },
    1,
    async () => false,
  );
  warmup.schedule(target);
  await sleep(5);
  warmup.close();
  await sleep(30);
  assert.equal(signal.aborted, true);
  assert.equal(loads, 0);
  warmup.schedule(target);
  await sleep(5);
  assert.equal(loads, 0);
});
test("only standalone opening greetings qualify for a smaller prompt", () => {
  for (const greeting of ["Hello!", "hi", "Wagwan", "Good morning."])
    assert.equal(isOpeningGreeting(greeting), true);
  for (const task of [
    "Hello, list my files",
    "Hi, analyse this CSV",
    "continue",
    "thanks",
    "What can you see?",
    "hello\nread report.pdf",
  ])
    assert.equal(isOpeningGreeting(task), false);
});

test("renews empty keep-alive requests while active and stops renewing when hidden", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(
        url.endsWith("/api/tags") ? { models: [{ name: target.model }] } : {},
      ),
    );
  };
  const warmup = new LocalModelWarmup(
    request,
    1,
    async () => false,
    () => true,
    15,
  );
  warmup.schedule(target);
  await sleep(45);
  assert.ok(calls.filter((c) => c.url.endsWith("/api/generate")).length >= 2);
  warmup.setActive(false);
  const count = calls.length;
  await sleep(40);
  assert.equal(calls.length, count);
  warmup.close();
});
test("memory pressure releases an owned warm model and prevents repeated reloading", async () => {
  let pressure = false;
  const requests = [];
  const request = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ models: [{ name: target.model }] }));
  };
  const warmup = new LocalModelWarmup(
    request,
    1,
    async () => pressure,
    () => true,
    15,
  );
  const waitForGenerations = async (count) => {
    const deadline = Date.now() + 2000;
    while (requests.filter(c => c.url.endsWith('/api/generate')).length < count && Date.now() < deadline) await sleep(5);
    assert.equal(requests.filter(c => c.url.endsWith('/api/generate')).length, count);
  };
  warmup.schedule(target);
  await waitForGenerations(1);
  pressure = true;
  await waitForGenerations(2);
  const generates = requests
    .filter((c) => c.url.endsWith("/api/generate"))
    .map((c) => JSON.parse(c.options.body));
  assert.equal(generates.length, 2);
  assert.equal(generates[1].keep_alive, 0);
  pressure = false;
  warmup.schedule(target);
  await sleep(25);
  assert.equal(
    requests.filter((c) => c.url.endsWith("/api/generate")).length,
    2,
  );
  warmup.close();
});
test("another app’s resident model is neither replaced nor unloaded by background warm-up", async () => {
  const calls = [];
  const warmup = new LocalModelWarmup(
    async (url, options) => {
      calls.push(url);
      return new Response(
        JSON.stringify({
          models: [
            {
              name: url.endsWith("/api/tags")
                ? target.model
                : "another-app:latest",
            },
          ],
        }),
      );
    },
    1,
    async () => false,
    () => false,
    15,
  );
  warmup.schedule(target);
  await sleep(35);
  assert.equal(
    calls.some((url) => url.endsWith("/api/generate")),
    false,
  );
  warmup.close();
});

test("media handoff releases only the active chat model on an owned server", async () => {
  const calls = [];
  const warmup = new LocalModelWarmup(async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ models: [{ name: target.model }] }));
  }, 1, async () => false, () => true);
  const finish = warmup.beginForeground();
  try {
    await warmup.releaseForMedia(target);
    assert.equal(calls.length, 2);
    assert.deepEqual(JSON.parse(calls[1].options.body), { model: target.model, keep_alive: 0 });
    finish();
    warmup.schedule(target);
    await sleep(20);
    assert.equal(calls.length, 2, "Media cooldown immediately reloaded chat weights");
  } finally { finish(); warmup.close(); }
});

test("media handoff preserves external servers and concurrent foreground work", async () => {
  for (const [owned, foregroundCount] of [[false, 1], [true, 0], [true, 2]]) {
    const calls = [];
    const warmup = new LocalModelWarmup(async (url) => { calls.push(url); return new Response('{}'); }, 1, async () => false, () => owned);
    const releases = Array.from({ length: foregroundCount }, () => warmup.beginForeground());
    try { await warmup.releaseForMedia(target); assert.equal(calls.length, 0); }
    finally { releases.forEach(release => release()); warmup.close(); }
  }
});

test("another foreground turn arriving during residency lookup cancels media unloading", async () => {
  let second;
  const calls = [];
  const warmup = new LocalModelWarmup(async (url) => {
    calls.push(url);
    second = warmup.beginForeground();
    return new Response(JSON.stringify({ models: [{ name: target.model }] }));
  }, 1, async () => false, () => true);
  const finish = warmup.beginForeground();
  try { await warmup.releaseForMedia(target); assert.equal(calls.length, 1); }
  finally { second?.(); finish(); warmup.close(); }
});

test("a managed process never grants ownership of another configured endpoint", () => {
  const { LocalModelManager } = createRequire(import.meta.url)(join(output, 'model.cjs'));
  const manager = new LocalModelManager('/unused-fixture', 'selected:latest', () => {});
  manager.server = { killed: false, exitCode: null };
  assert.equal(manager.ownsServer('http://127.0.0.1:11434'), true);
  assert.equal(manager.ownsServer('http://localhost:11434'), true);
  for (const endpoint of ['http://127.0.0.1:11435', 'https://remote.example', 'http://127.0.0.1:11434/api', 'invalid']) assert.equal(manager.ownsServer(endpoint), false);
  manager.server.exitCode = 0;
  assert.equal(manager.ownsServer(), false);
});
