import assert from "node:assert/strict";
import test from "node:test";
import type { LabWorkspaceFileRecord } from "../types/lab-workspace.ts";
import { resolveLabWorkspaceEntry } from "./lab-workspace-entry.ts";

const files = [
  file("04_Block2_Assistant/zawadi_monday_inbox.md"),
  file("04_Block2_Assistant/Recording_Lab/Roleplay_Script.md"),
];

test("opens an exact contextual lab artifact", () => {
  const entry = resolveLabWorkspaceEntry(
    files,
    "04_Block2_Assistant/zawadi_monday_inbox.md",
  );
  assert.equal(entry.folderPath, "04_Block2_Assistant");
  assert.equal(entry.file?.path, "04_Block2_Assistant/zawadi_monday_inbox.md");
});

test("opens a contextual lab folder and falls back to its nearest parent", () => {
  assert.deepEqual(
    resolveLabWorkspaceEntry(files, "04_Block2_Assistant/Recording_Lab"),
    { folderPath: "04_Block2_Assistant/Recording_Lab" },
  );
  assert.deepEqual(
    resolveLabWorkspaceEntry(files, "04_Block2_Assistant/missing.txt"),
    { folderPath: "04_Block2_Assistant" },
  );
});

function file(path: string): LabWorkspaceFileRecord {
  return {
    id: path,
    path,
    name: path.split("/").at(-1) || path,
    mimeType: "text/markdown",
    size: 10,
    audience: "learner",
    editable: true,
    url: "/file",
    downloadUrl: "/file?download=1",
  };
}
