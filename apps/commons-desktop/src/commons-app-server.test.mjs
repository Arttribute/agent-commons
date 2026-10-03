import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bundleProblem } from "./commons-app-server.ts";

function write(path, contents = "{}") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function bundle(packages) {
  const root = mkdtempSync(join(tmpdir(), "commons-app-bundle-"));
  const app = join(root, "apps", "commons-app");
  write(join(app, "server.js"), "");
  for (const name of packages) write(join(root, "node_modules", name, "package.json"), JSON.stringify({ name }));
  return { root, app };
}

const runtime = ["next", "styled-jsx", "react", "react-dom"];

test("a complete bundle can start", () => {
  const { root, app } = bundle(runtime);
  try {
    assert.equal(bundleProblem(root, app), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a bundle without styled-jsx reports the missing module", () => {
  const { root, app } = bundle(runtime.filter((name) => name !== "styled-jsx"));
  try {
    const problem = bundleProblem(root, app);
    assert.match(problem, /missing/);
    assert.match(problem, /styled-jsx/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the pnpm tree that 0.4.2 left behind is reported", () => {
  const { root, app } = bundle(runtime);
  try {
    // 0.4.2 installed Next.js under the app and styled-jsx only in .pnpm.
    write(join(app, "node_modules", "next", "package.json"), JSON.stringify({ name: "next" }));
    write(join(root, "node_modules", ".pnpm", "styled-jsx@5.1.6", "node_modules", "styled-jsx", "package.json"));
    assert.match(bundleProblem(root, app), /earlier Agent Commons version/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
