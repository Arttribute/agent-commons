import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertSpeechDownloadFits, prepareSpeechArtifacts, repairSpeechArtifacts, verifySpeechArtifacts } from "./local-speech-model-cache.ts";

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

test('speech weights become visible only after a complete verified download, and concurrent preparation reuses it', async () => {
  const cache = mkdtempSync(join(tmpdir(), 'commons-speech-atomic-'));
  const artifact = {model:'Xenova/example',revision:'reviewed-commit',file:'onnx/model.onnx',bytes:6,sha256:createHash('sha256').update('weight').digest('hex')};
  const target = join(cache,artifact.model,artifact.revision,artifact.file);
  let requests = 0;
  const fetchWeight = async () => { requests++; return new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('wei')); setTimeout(() => {controller.enqueue(Buffer.from('ght'));controller.close();},20); } })); };
  try {
    await Promise.all([prepareSpeechArtifacts(cache,[artifact],fetchWeight),prepareSpeechArtifacts(cache,[artifact],fetchWeight)]);
    assert.equal(requests,1);
    assert.equal(readFileSync(target,'utf8'),'weight');
    await verifySpeechArtifacts(cache,[artifact]);
    assert.deepEqual(readdirSync(join(cache,artifact.model,artifact.revision,'onnx')),['model.onnx']);
    await prepareSpeechArtifacts(cache,[artifact],fetchWeight); assert.equal(requests,1);
    await assert.rejects(prepareSpeechArtifacts(cache,[{...artifact,file:'onnx/bad.onnx'}],async()=>new Response('broken')),/checksum/);
    assert.deepEqual(readdirSync(join(cache,artifact.model,artifact.revision,'onnx')),['model.onnx']);
  } finally {rmSync(cache,{recursive:true,force:true});}
});
