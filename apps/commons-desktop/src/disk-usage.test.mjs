import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanDiskUsage } from "../../../packages/agc-cli/src/disk-usage.ts";

test("ranks selected-folder sizes without following links or reading excluded paths", async () => {
  const root = mkdtempSync(join(tmpdir(), "commons-disk-usage-"));
  const outside = mkdtempSync(join(tmpdir(), "commons-disk-outside-"));
  try {
    mkdirSync(join(root, "large"));
    writeFileSync(join(root, "large", "data.bin"), "123456");
    writeFileSync(join(root, "small.txt"), "12");
    writeFileSync(join(root, ".ssh"), "excluded");
    writeFileSync(join(outside, "secret.bin"), "1234567890");
    symlinkSync(outside, join(root, "linked"), "dir");
    const result = await scanDiskUsage(root, undefined, (path) => {
      if (path.endsWith(".ssh")) throw new Error("excluded");
    });
    assert.deepEqual(result.entries.map(({ path, sizeBytes }) => [path, sizeBytes]), [["large", 6], ["small.txt", 2]]);
    assert.equal(result.incomplete, false);
    assert.ok(result.skipped >= 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
