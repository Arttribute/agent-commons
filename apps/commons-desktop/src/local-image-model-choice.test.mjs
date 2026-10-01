import assert from "node:assert/strict";
import test from "node:test";
import { recommendedImageModelId, supportsImageStarter } from "./local-image-model-choice.ts";

test("automatic image model fits supported laptop memory", () => {
  const gib = 1024 ** 3;
  assert.equal(supportsImageStarter(4 * gib), false);
  assert.equal(supportsImageStarter(5 * gib), false);
  assert.equal(recommendedImageModelId(8 * gib), "tiny-sd-q4.gguf");
  assert.equal(supportsImageStarter(8 * gib), true);
  assert.equal(recommendedImageModelId(16 * gib), "tiny-sd.safetensors");
});
