import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { assertPortableStandalone, flattenStandaloneModules } from "../scripts/flatten-standalone-modules.mjs";

// Junctions need no privileges on Windows; elsewhere keep pnpm's relative links.
function link(target, path) {
  mkdirSync(dirname(path), { recursive: true });
  if (process.platform === "win32") symlinkSync(resolve(dirname(path), target), path, "junction");
  else symlinkSync(target, path, "dir");
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function pkg(directory, name, main = "module.exports = require('./package.json').name;") {
  write(join(directory, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  write(join(directory, "index.js"), main);
}

/** A pnpm standalone tree: app -> next -> styled-jsx, with react shared. */
function standaloneFixture(directory) {
  const source = join(directory, "standalone");
  const store = join(source, "node_modules", ".pnpm");
  const app = join(source, "apps", "commons-app");
  write(join(app, "server.js"), "module.exports = require('next');");
  pkg(join(store, "next@1", "node_modules", "next"), "next", [
    "module.exports = {",
    "  styled: require('styled-jsx/package.json').name,",
    "  env: require('@next/env'),",
    "  react: require.resolve('react'),",
    "};",
  ].join("\n"));
  pkg(join(store, "styled-jsx@1", "node_modules", "styled-jsx"), "styled-jsx");
  pkg(join(store, "react@1", "node_modules", "react"), "react");
  pkg(join(store, "react-dom@1", "node_modules", "react-dom"), "react-dom");
  pkg(join(store, "@next+env@1", "node_modules", "@next", "env"), "@next/env");
  for (const dependency of ["styled-jsx@1/node_modules/styled-jsx", "react@1/node_modules/react", "react-dom@1/node_modules/react-dom"]) {
    link(`../../${dependency}`, join(store, "next@1", "node_modules", dependency.split("/node_modules/")[1]));
  }
  link("../../../@next+env@1/node_modules/@next/env", join(store, "next@1", "node_modules", "@next", "env"));
  link("../../react@1/node_modules/react", join(store, "styled-jsx@1", "node_modules", "react"));
  link("../../../node_modules/.pnpm/next@1/node_modules/next", join(app, "node_modules", "next"));
  link("../../../node_modules/.pnpm/react@1/node_modules/react", join(app, "node_modules", "react"));
  return { source, store, app };
}

test("flattened Commons modules start Next without any links", () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-bundle-flat-"));
  try {
    const { source } = standaloneFixture(directory);
    const target = join(directory, "package");
    write(join(target, "apps", "commons-app", "server.js"), "module.exports = require('next');");
    flattenStandaloneModules(source, target);
    rmSync(source, { recursive: true, force: true });

    const server = join(target, "apps", "commons-app", "server.js");
    assertPortableStandalone(target, server);
    const next = createRequire(server)(server);
    assert.equal(next.styled, "styled-jsx");
    assert.equal(next.env, "@next/env");
    // The app and Next share one React instance.
    assert.equal(realpathSync(next.react), realpathSync(createRequire(server).resolve("react")));
    assert.equal(realpathSync(next.react), join(realpathSync(target), "node_modules", "react", "index.js"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("conflicting dependency versions stay with the packages that need them", () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-bundle-versions-"));
  try {
    const source = join(directory, "standalone");
    const store = join(source, "node_modules", ".pnpm");
    const app = join(source, "apps", "commons-app");
    const versioned = (version) => `module.exports = '${version}';`;
    pkg(join(store, "a@1", "node_modules", "a"), "a", "module.exports = require('shared');");
    pkg(join(store, "b@1", "node_modules", "b"), "b", "module.exports = require('shared');");
    pkg(join(store, "shared@1", "node_modules", "shared"), "shared", versioned("1"));
    pkg(join(store, "shared@2", "node_modules", "shared"), "shared", versioned("2"));
    link("../../shared@1/node_modules/shared", join(store, "a@1", "node_modules", "shared"));
    link("../../shared@2/node_modules/shared", join(store, "b@1", "node_modules", "shared"));
    link("../../../node_modules/.pnpm/a@1/node_modules/a", join(app, "node_modules", "a"));
    link("../../../node_modules/.pnpm/b@1/node_modules/b", join(app, "node_modules", "b"));
    const target = join(directory, "package");
    write(join(target, "apps", "commons-app", "server.js"), "");
    flattenStandaloneModules(source, target);
    rmSync(source, { recursive: true, force: true });

    const load = createRequire(join(target, "apps", "commons-app", "server.js"));
    assert.equal(load("a"), "1");
    assert.equal(load("b"), "2");
    assert.equal(readFileSync(join(target, "node_modules", "b", "node_modules", "shared", "index.js"), "utf8"), versioned("2"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("packages linked from outside the standalone tree are copied in", () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-bundle-external-"));
  try {
    const source = join(directory, "standalone");
    const workspaceStore = join(directory, "node_modules", ".pnpm");
    pkg(join(workspaceStore, "next@1", "node_modules", "next"), "next", "module.exports = require('styled-jsx/package.json').name;");
    pkg(join(workspaceStore, "styled-jsx@1", "node_modules", "styled-jsx"), "styled-jsx");
    link("../../styled-jsx@1/node_modules/styled-jsx", join(workspaceStore, "next@1", "node_modules", "styled-jsx"));
    link(join(workspaceStore, "next@1", "node_modules", "next"), join(source, "apps", "commons-app", "node_modules", "next"));
    const target = join(directory, "package");
    write(join(target, "apps", "commons-app", "server.js"), "module.exports = require('next');");
    flattenStandaloneModules(source, target);
    rmSync(source, { recursive: true, force: true });
    rmSync(join(directory, "node_modules"), { recursive: true, force: true });

    const server = join(target, "apps", "commons-app", "server.js");
    assert.equal(createRequire(server)(server), "styled-jsx");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("bundle verification rejects links and unresolved Next dependencies", () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-bundle-verify-"));
  try {
    const { source, app } = standaloneFixture(directory);
    assert.throws(() => assertPortableStandalone(source, join(app, "server.js")), /still contains links/);

    const target = join(directory, "package");
    write(join(target, "apps", "commons-app", "server.js"), "");
    flattenStandaloneModules(source, target);
    rmSync(join(target, "node_modules", "styled-jsx"), { recursive: true, force: true });
    assert.throws(() => assertPortableStandalone(target, join(target, "apps", "commons-app", "server.js")), /styled-jsx/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
