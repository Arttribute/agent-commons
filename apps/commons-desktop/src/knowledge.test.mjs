import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { accessibleSpaces, indexFolders, knowledgeTool } from "./knowledge.ts";

test("lists, searches and reads the same indexed Knowledge files, enforcing agent and selected-space access", async () => {
  const root = mkdtempSync(join(tmpdir(), "commons-knowledge-"));
  try {
    const path = join(root, "launch.md");
    writeFileSync(path, "Mango launches October 18. Owner: Amina.");
    const space = { id: "mango", name: "Mango", folders: [root], files: await indexFolders([root]) };
    const hidden = { ...space, id: "private", autoGrantNewAgents: false, grants: [] };
    const available = accessibleSpaces([space, hidden], "agent");
    assert.deepEqual(available.map((space) => space.id), ["mango"]);
    assert.deepEqual(accessibleSpaces([space, hidden], "agent", ["private"]), []);
    assert.match(await knowledgeTool(available, "list_knowledge_spaces", {}), /"documents":1/);
    assert.equal(JSON.parse(await knowledgeTool(available, "list_knowledge_documents", { spaceId: "mango" })).documents[0].path, path);
    assert.match(await knowledgeTool(available, "search_knowledge", { query: "Mango" }), /Amina/);
    writeFileSync(path, "Updated owner: Baraka.");
    assert.match(await knowledgeTool(available, "read_knowledge_document", { spaceId: "mango", path }), /Baraka/);
    assert.match(await knowledgeTool(available, "read_knowledge_document", { spaceId: "private", path }), /^Error:/);
    if (process.platform !== "win32") {
      unlinkSync(path);
      symlinkSync("/etc/hosts", path);
      assert.match(await knowledgeTool(available, "read_knowledge_document", { spaceId: "mango", path }), /^Error:/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
