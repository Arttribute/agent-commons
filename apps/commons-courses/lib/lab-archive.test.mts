import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { normalizeArchivePath, parseLabArchive } from "./lab-archive.ts";

test("rejects traversal paths", () => {
  assert.throws(
    () => normalizeArchivePath("../answer-key.pdf"),
    /Unsafe ZIP path/,
  );
  assert.throws(() => normalizeArchivePath("/absolute.txt"), /Unsafe ZIP path/);
});

test("uses the manifest to keep facilitator files out of the learner pack", async () => {
  const zip = new JSZip();
  zip.file(
    "Pack/Lab_Asset_Manifest.csv",
    'Path,Audience,Purpose\nnotes.md,Learner,"Editable notes"\nfacilitator/key.txt,Facilitator,"Private key"\n',
  );
  zip.file("Pack/notes.md", "Learner copy");
  zip.file("Pack/facilitator/key.txt", "Private answer");
  const parsed = await parseLabArchive(
    Buffer.from(await zip.generateAsync({ type: "uint8array" })),
  );
  assert.equal(
    parsed.files.find((file) => file.path === "notes.md")?.audience,
    "learner",
  );
  assert.equal(
    parsed.files.find((file) => file.path === "facilitator/key.txt")?.audience,
    "facilitator",
  );
  const learner = await JSZip.loadAsync(parsed.learnerPack);
  assert.ok(learner.file("notes.md"));
  assert.equal(learner.file("facilitator/key.txt"), null);
});
