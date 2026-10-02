import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import yazl from "yazl";
import { installPinnedFilesFromRemoteZip, RangeRequestsUnsupportedError } from "./ranged-runtime-zip.ts";

const files = {
  "ollama.exe": Buffer.from("runtime executable"),
  "lib/ollama/ggml-cpu-x64.dll": Buffer.from("cpu backend ".repeat(500)),
  // Native libraries barely compress, so the skipped entry dominates the archive.
  "lib/ollama/cuda_v13/ggml-cuda.dll": randomBytes(2_000_000),
};
const pin = (path) => ({ path, size: files[path].length, sha256: createHash("sha256").update(files[path]).digest("hex") });

async function zipBuffer() {
  const zip = new yazl.ZipFile();
  for (const [path, data] of Object.entries(files)) zip.addBuffer(data, path);
  zip.end();
  const chunks = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function serve(archive, { ranges = true } = {}) {
  let servedBytes = 0;
  const server = createServer((request, response) => {
    const match = /bytes=(\d+)-(\d+)/.exec(request.headers.range ?? "");
    if (!ranges || !match) {
      servedBytes += archive.length;
      response.writeHead(200, { "Content-Length": archive.length });
      response.end(archive);
      return;
    }
    const body = archive.subarray(Number(match[1]), Number(match[2]) + 1);
    servedBytes += body.length;
    response.writeHead(206, { "Content-Length": body.length, "Content-Range": `bytes ${match[1]}-${match[2]}/${archive.length}` });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/runtime.zip`, server, served: () => servedBytes };
}

test("installs only the pinned files and downloads only their bytes", async () => {
  const archive = await zipBuffer();
  const { url, server, served } = await serve(archive);
  const root = mkdtempSync(join(tmpdir(), "ranged-runtime-"));
  const destination = join(root, "runtime", "0.34.3");
  try {
    let progress = 0;
    await installPinnedFilesFromRemoteZip({
      url, archiveSize: archive.length, destination,
      files: [pin("ollama.exe"), pin("lib/ollama/ggml-cpu-x64.dll")],
      onProgress: (value) => { progress = value; },
    });
    assert.deepEqual(readFileSync(join(destination, "ollama.exe")), files["ollama.exe"]);
    assert.deepEqual(readFileSync(join(destination, "lib/ollama/ggml-cpu-x64.dll")), files["lib/ollama/ggml-cpu-x64.dll"]);
    assert.equal(existsSync(join(destination, "lib/ollama/cuda_v13")), false);
    assert.equal(existsSync(`${destination}.partial`), false);
    assert.equal(progress, 1);
    assert.ok(served() < archive.length / 2, `downloaded ${served()} of ${archive.length} bytes`);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a server that ignores Range is reported so setup can use the full archive", async () => {
  const archive = await zipBuffer();
  const { url, server } = await serve(archive, { ranges: false });
  const root = mkdtempSync(join(tmpdir(), "ranged-runtime-"));
  const destination = join(root, "runtime");
  try {
    await assert.rejects(
      installPinnedFilesFromRemoteZip({ url, archiveSize: archive.length, destination, files: [pin("ollama.exe")] }),
      RangeRequestsUnsupportedError,
    );
    assert.equal(existsSync(destination), false);
    assert.equal(existsSync(`${destination}.partial`), false);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file that differs from its pinned hash installs nothing", async () => {
  const archive = await zipBuffer();
  const { url, server } = await serve(archive);
  const root = mkdtempSync(join(tmpdir(), "ranged-runtime-"));
  const destination = join(root, "runtime");
  mkdirSync(destination);
  writeFileSync(join(destination, "previous"), "kept");
  try {
    await assert.rejects(
      installPinnedFilesFromRemoteZip({
        url, archiveSize: archive.length, destination,
        files: [pin("ollama.exe"), { ...pin("lib/ollama/ggml-cpu-x64.dll"), sha256: "0".repeat(64) }],
      }),
      /integrity check failed/,
    );
    assert.equal(readFileSync(join(destination, "previous"), "utf8"), "kept");
    assert.equal(existsSync(`${destination}.partial`), false);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("an archive missing a pinned file installs nothing", async () => {
  const archive = await zipBuffer();
  const { url, server } = await serve(archive);
  const root = mkdtempSync(join(tmpdir(), "ranged-runtime-"));
  const destination = join(root, "runtime");
  try {
    await assert.rejects(
      installPinnedFilesFromRemoteZip({
        url, archiveSize: archive.length, destination,
        files: [pin("ollama.exe"), { path: "lib/ollama/ggml-base.dll", size: 1, sha256: "0".repeat(64) }],
      }),
      /missing lib\/ollama\/ggml-base\.dll/,
    );
    assert.equal(existsSync(destination), false);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
