import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const bundle = join(appDir, ".image-smoke", "local-image.cjs");
const require = createRequire(import.meta.url);
const { LocalImageManager } = require(bundle);
const storage = mkdtempSync(join(tmpdir(), "commons-image-runtime-"));

try {
  const manager = new LocalImageManager(storage, () => {});
  await manager.prepare(false);
  const executable = join(storage, "image-generation", "runtime", process.platform === "win32" ? "sd-cli.exe" : "sd-cli");
  assert.ok(statSync(executable).size > 0, "The verified image runtime executable is empty");
  const result = spawnSync(executable, ["--help"], { encoding: "utf8", timeout: 30_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `The image runtime could not launch: ${(result.stderr || result.stdout).slice(-1000)}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /usage|options|stable diffusion/i);
  console.log(`Verified image runtime downloaded, extracted, and launched on ${process.platform}-${process.arch}`);
} finally {
  rmSync(storage, { recursive: true, force: true });
  rmSync(join(appDir, ".image-smoke"), { recursive: true, force: true });
}
