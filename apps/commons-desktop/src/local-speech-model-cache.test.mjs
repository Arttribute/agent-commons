import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertSpeechDownloadFits, repairSpeechArtifacts, verifySpeechArtifacts } from "./local-speech-model-cache.ts";

test("a speech model is ready only when its saved weight matches the reviewed hash", async () => {
  const cache = mkdtempSync(join(tmpdir(), "commons-speech-cache-"));
  const artifact = {
    model: "Xenova/example",
    revision: "reviewed-commit",
    file: "onnx/model.onnx",
    bytes: 6,
    sha256: createHash("sha256").update("weight").digest("hex"),
  };
  const location = join(cache, artifact.model, artifact.revision, artifact.file);
  try {
    await assert.rejects(verifySpeechArtifacts(cache, [artifact]), /did not finish saving/);
    assert.throws(() => assertSpeechDownloadFits(cache, [{ ...artifact, bytes: 1024 ** 4 }]), /free disk space/);
    mkdirSync(join(cache, artifact.model, artifact.revision, "onnx"), { recursive: true });
    writeFileSync(location, "weight");
    await verifySpeechArtifacts(cache, [artifact]);
    writeFileSync(location, "broken");
    await assert.rejects(verifySpeechArtifacts(cache, [artifact]), /checksum/);
    await repairSpeechArtifacts(cache, [artifact]);
    await assert.rejects(verifySpeechArtifacts(cache, [artifact]), /did not finish saving/);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});
