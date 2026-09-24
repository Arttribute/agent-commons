import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
