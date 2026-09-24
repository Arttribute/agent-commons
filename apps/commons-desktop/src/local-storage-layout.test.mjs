import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorageLayout } from "./local-storage-layout.ts";

test("local record cleanup preserves files people and agents placed in the workspace", () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-layout-test-"));
  try {
    const layout = new LocalStorageLayout(directory);
    writeFileSync(layout.path("skills", "personal.md"), "# Personal notes\n");
    writeFileSync(layout.path("knowledge", "manual.json"), '{"mine":true}\n');
    writeFileSync(layout.path("artifacts", "export.json"), '{"mine":true}\n');
    const state = { agents: [{ id: "agent-1", name: "Helper" }], conversations: [], tasks: [], workflows: [], apps: [], spaces: [], library: [],
      skills: [{ id: "skill-1", slug: "managed-skill", name: "Managed", description: "", triggers: [], tags: [], instructions: "Do the work" }] };
    layout.sync(state);
    assert.equal(existsSync(layout.path("agents", "agent-1.json")), true);
    assert.equal(existsSync(layout.path("skills", "managed-skill.md")), true);
    state.agents = [];
    state.skills = [];
    layout.sync(state);
    assert.equal(existsSync(layout.path("agents", "agent-1.json")), false);
    assert.equal(existsSync(layout.path("skills", "managed-skill.md")), false);
    assert.equal(readFileSync(layout.path("skills", "personal.md"), "utf8"), "# Personal notes\n");
    assert.equal(readFileSync(layout.path("knowledge", "manual.json"), "utf8"), '{"mine":true}\n');
    assert.equal(readFileSync(layout.path("artifacts", "export.json"), "utf8"), '{"mine":true}\n');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("existing Local workspace directories are private", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "commons-layout-permissions-"));
  try {
    const root = join(directory, "private-local", "workspace");
    const apps = join(root, "apps");
    mkdirSync(apps, { recursive: true });
    chmodSync(root, 0o755);
    chmodSync(apps, 0o755);
    new LocalStorageLayout(directory);
    assert.equal(statSync(root).mode & 0o777, 0o700);
    assert.equal(statSync(apps).mode & 0o777, 0o700);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
