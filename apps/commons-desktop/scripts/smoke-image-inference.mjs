import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const bundle = join(appDir, ".image-smoke", "local-image.cjs");
const require = createRequire(import.meta.url);
const { LocalImageManager } = require(bundle);
const storage = mkdtempSync(join(tmpdir(), "commons-image-inference-"));

try {
  const manager = new LocalImageManager(storage, () => {});
  await manager.prepareModel("tiny-sd-q4.gguf");
  const executable = join(storage, "image-generation", "runtime", process.platform === "win32" ? "sd-cli.exe" : "sd-cli");
  const model = join(manager.modelDirectory(), "tiny-sd-q4.gguf");
  const output = join(storage, "image-generation", "smoke.png");
  const result = spawnSync(executable, [
    "-m", model, "-W", "256", "-H", "256", "--cfg-scale", "7",
    "--steps", "1", "--sampling-method", "euler_a", "--diffusion-fa",
    "--seed", "42", "-o", output, "-p", "A small blue circle on a white background",
  ], { encoding: "utf8", timeout: 12 * 60_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Image inference failed: ${(result.stderr || result.stdout).slice(-2000)}`);
  assert.ok(statSync(output).size > 100, "Image inference produced an empty PNG");
  assert.deepEqual(readFileSync(output).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  console.log(`Verified Q4 image inference generated a PNG on ${process.platform}-${process.arch}`);
} finally {
  rmSync(storage, { recursive: true, force: true });
  rmSync(join(appDir, ".image-smoke"), { recursive: true, force: true });
}
