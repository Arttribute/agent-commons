import assert from "node:assert/strict";
import test from "node:test";
import { assertReviewedModelDigest } from "./reviewed-model-digests.ts";

test("automatic Local defaults require their reviewed Ollama manifests", () => {
  assert.doesNotThrow(() => assertReviewedModelDigest("qwen3.5:2b", "324d162be6ca5629ae4517c8710434d0bd2d665bc94dbad46e9af8fbf8a2f0df"));
  assert.doesNotThrow(() => assertReviewedModelDigest("qwen3:1.7b", "8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7"));
  assert.throws(() => assertReviewedModelDigest("qwen3.5:2b", "changed"), /differs from the reviewed default/);
  assert.doesNotThrow(() => assertReviewedModelDigest("user-selected:latest", "other-digest"));
});
