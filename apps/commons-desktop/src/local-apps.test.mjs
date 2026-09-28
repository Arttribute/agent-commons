import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalAppData } from "./local-app-data.ts";
import { serveStaticApp } from "./local-static-server.ts";
import { assetReferences, downloadPublishedApp } from "./cloud-app-download.ts";

test("Local app data matches the Cloud record and query shapes", () => {
  const root = mkdtempSync(join(tmpdir(), "commons-appdata-"));
  try {
    const data = new LocalAppData(root);
    const first = data.execute("app1", "data.insert", { collection: "tasks", data: { title: "Draft", score: 2 } });
    data.execute("app1", "data.insert", { collection: "tasks", data: { title: "Ship", score: 5 } });
    assert.match(first.id, /^[0-9a-f-]{36}$/);
    const high = data.execute("app1", "data.query", { collection: "tasks", query: { where: { score: { gte: 3 } } } });
    assert.deepEqual(high.items.map((item) => item.data.title), ["Ship"]);
    assert.equal(high.hasMore, false);
    data.execute("app1", "data.update", { collection: "tasks", id: first.id, data: { score: 9 } });
    assert.equal(data.execute("app1", "data.get", { collection: "tasks", id: first.id }).data.title, "Draft");
    assert.deepEqual(data.execute("app1", "data.collections", {}).collections, [{ name: "tasks", description: undefined, count: 2 }]);
    assert.throws(() => data.execute("../escape", "data.query", { collection: "tasks" }), /Invalid app/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("serves a built app folder on loopback without escaping it", async () => {
  const root = mkdtempSync(join(tmpdir(), "commons-static-"));
  const server = await (async () => {
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "index.html"), "<script src=\"assets/app.js\"></script>");
    writeFileSync(join(root, "assets", "app.js"), "console.log(1)");
    return serveStaticApp(root);
  })();
  try {
    assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const script = await fetch(`${server.origin}/assets/app.js`);
    assert.equal(script.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(await script.text(), "console.log(1)");
    assert.match(await (await fetch(`${server.origin}/some/route`)).text(), /assets\/app\.js/);
    assert.notEqual(await (await fetch(`${server.origin}/..%2f..%2fetc%2fhosts`)).text(), "");
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps a published Cloud app build, fetching only its own deployment files", async () => {
  const base = "https://preview.example/v1/previews/notes/deployments/123e4567-e89b-12d3-a456-426614174000/";
  const pages = {
    [`${base}index.html`]: ["text/html", '<link href="./style.css" rel="stylesheet"><script type="module" src="assets/main.js"></script><img src="https://cdn.example/x.png">'],
    [`${base}style.css`]: ["text/css", "body{background:url(img/bg.png)}"],
    [`${base}assets/main.js`]: ["text/javascript", 'import "./chunk.js"; const u = new URL("./worker.js", import.meta.url);'],
    [`${base}assets/chunk.js`]: ["text/javascript", "export {}"],
    [`${base}assets/worker.js`]: ["text/javascript", ""],
    [`${base}img/bg.png`]: ["image/png", "png"],
  };
  const requested = [];
  const files = await downloadPublishedApp(`${base}?commonsSurface=page`, async (url) => {
    requested.push(url);
    const hit = pages[url];
    return hit ? new Response(hit[1], { headers: { "content-type": hit[0] } }) : new Response("missing", { status: 404 });
  });
  assert.deepEqual(files.map((file) => file.path).sort(), ["assets/chunk.js", "assets/main.js", "assets/worker.js", "img/bg.png", "index.html", "style.css"]);
  assert.ok(requested.every((url) => url.startsWith(base)));
  await assert.rejects(downloadPublishedApp("https://preview.example/draft/", async () => new Response("")), /published app deployments/);
  assert.deepEqual(assetReferences('<a href="#top"></a><img src="data:x">', "text/html"), []);
});
