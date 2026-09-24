import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { relocateStandaloneLinks } from "../scripts/relocate-standalone-links.mjs";

test("packaged Commons links resolve after the Next staging tree is removed", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-bundle-test-"));
  const source = join(directory, "standalone");
  const target = join(directory, "package");
  try {
    mkdirSync(join(source, "node_modules", "next"), { recursive: true });
    mkdirSync(join(source, "apps", "commons-app", "node_modules"), { recursive: true });
    writeFileSync(join(source, "node_modules", "next", "package.json"), '{"name":"next"}');
    symlinkSync(join(source, "node_modules", "next"), join(source, "apps", "commons-app", "node_modules", "next"), "dir");
    cpSync(source, target, { recursive: true });
    relocateStandaloneLinks(source, target);
    assert.equal(readlinkSync(join(target, "apps", "commons-app", "node_modules", "next")).startsWith("/"), false);
    rmSync(source, { recursive: true, force: true });
    assert.equal(existsSync(join(target, "apps", "commons-app", "node_modules", "next", "package.json")), true);
    assert.equal(readFileSync(join(target, "apps", "commons-app", "node_modules", "next", "package.json"), "utf8"), '{"name":"next"}');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("pnpm sibling dependencies resolve from an externally linked Next package", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-bundle-pnpm-"));
  const source = join(directory, "standalone");
  const target = join(directory, "package");
  const packages = join(directory, "node_modules", ".pnpm");
  const nextWrapper = join(packages, "next@1", "node_modules");
  const styledWrapper = join(packages, "styled-jsx@1", "node_modules");
  try {
    mkdirSync(join(nextWrapper, "next"), { recursive: true });
    mkdirSync(join(styledWrapper, "styled-jsx"), { recursive: true });
    mkdirSync(join(source, "apps", "commons-app", "node_modules"), { recursive: true });
    writeFileSync(join(nextWrapper, "next", "require-hook.js"), 'module.exports = require("styled-jsx/package.json").name;');
    writeFileSync(join(styledWrapper, "styled-jsx", "package.json"), '{"name":"styled-jsx"}');
    symlinkSync(join(styledWrapper, "styled-jsx"), join(nextWrapper, "styled-jsx"), "dir");
    symlinkSync(join(nextWrapper, "next"), join(source, "apps", "commons-app", "node_modules", "next"), "dir");
    cpSync(source, target, { recursive: true });
    relocateStandaloneLinks(source, target);
    rmSync(source, { recursive: true, force: true });
    rmSync(join(directory, "node_modules"), { recursive: true, force: true });
    const bundled = join(target, "apps", "commons-app", "node_modules", "next", "require-hook.js");
    assert.equal(createRequire(bundled)(bundled), "styled-jsx");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("external pnpm package links are copied into the desktop bundle", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-bundle-external-"));
  const source = join(directory, "standalone");
  const target = join(directory, "package");
  const external = join(directory, "pnpm-store", "next");
  try {
    mkdirSync(external, { recursive: true });
    mkdirSync(join(source, "apps", "commons-app", "node_modules"), { recursive: true });
    writeFileSync(join(external, "package.json"), '{"name":"next"}');
    symlinkSync(external, join(source, "apps", "commons-app", "node_modules", "next"), "dir");
    cpSync(source, target, { recursive: true });
    relocateStandaloneLinks(source, target);
    rmSync(source, { recursive: true, force: true });
    rmSync(join(directory, "pnpm-store"), { recursive: true, force: true });
    assert.equal(readFileSync(join(target, "apps", "commons-app", "node_modules", "next", "package.json"), "utf8"), '{"name":"next"}');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
