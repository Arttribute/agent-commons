import assert from "node:assert/strict";
import { createWriteStream, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import yazl from "yazl";
import { extractVerifiedRuntimeZip } from "./verified-runtime-zip.ts";

async function archive(path, entries) {
  const zip = new yazl.ZipFile();
  for (const entry of entries) zip.addBuffer(Buffer.from(entry.content), entry.name, { mode: entry.mode });
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

test("extracts ordinary runtime files and rejects archive links", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "commons-runtime-zip-"));
  try {
    const safeZip = join(scratch, "safe.zip");
    await archive(safeZip, [{ name: "bin/sd-cli", content: "runtime", mode: 0o100755 }]);
    await extractVerifiedRuntimeZip(safeZip, join(scratch, "safe"));
    assert.equal(readFileSync(join(scratch, "safe", "bin", "sd-cli"), "utf8"), "runtime");

    const maliciousZip = join(scratch, "link.zip");
    await archive(maliciousZip, [{ name: "sd-cli", content: "../../outside", mode: 0o120777 }]);
    await assert.rejects(extractVerifiedRuntimeZip(maliciousZip, join(scratch, "blocked")), /link or unsupported/);
    assert.equal(existsSync(join(scratch, "outside")), false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
