import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertNativeBinaries,
  pruneBuildOnlyPackages,
  pruneForeignNativeBinaries,
} from "../scripts/prune-bundle.mjs";

function tree(paths) {
  const root = mkdtempSync(join(tmpdir(), "prune-bundle-"));
  for (const path of paths) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "package.json"), "{}");
  }
  return root;
}

test("build-only compilers leave while Next's runtime helpers stay", () => {
  const root = tree(["@swc/core", "@swc/core-darwin-arm64", "@swc/helpers", "@esbuild/darwin-arm64", "typescript", "webpack", "next", "react"]);
  try {
    pruneBuildOnlyPackages(root);
    for (const gone of ["@swc/core", "@swc/core-darwin-arm64", "@esbuild", "typescript", "webpack"]) {
      assert.equal(existsSync(join(root, gone)), false, gone);
    }
    for (const kept of ["@swc/helpers", "next", "react"]) {
      assert.equal(existsSync(join(root, kept)), true, kept);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("each installer keeps only its own platform and CPU binaries, nested ones included", () => {
  const root = tree([
    "@img/colour",
    "@img/sharp-darwin-arm64",
    "@img/sharp-darwin-x64",
    "@img/sharp-libvips-darwin-arm64",
    "@img/sharp-libvips-darwin-x64",
    "@img/sharp-libvips-linux-x64",
    "@img/sharp-win32-x64",
    "@huggingface/transformers/node_modules/onnxruntime-node/bin/napi-v3/darwin/x64",
    "@huggingface/transformers/node_modules/onnxruntime-node/bin/napi-v3/darwin/arm64",
    "@huggingface/transformers/node_modules/onnxruntime-node/bin/napi-v3/win32/x64",
  ]);
  const binding = join(root, "@huggingface/transformers/node_modules/onnxruntime-node/bin/napi-v3/darwin/x64/onnxruntime_binding.node");
  writeFileSync(binding, "");
  try {
    assertNativeBinaries(root, "darwin", "x64");
    pruneForeignNativeBinaries(root, "darwin", "x64");
    for (const kept of ["@img/colour", "@img/sharp-darwin-x64", "@img/sharp-libvips-darwin-x64"]) {
      assert.equal(existsSync(join(root, kept)), true, kept);
    }
    for (const gone of ["@img/sharp-darwin-arm64", "@img/sharp-libvips-darwin-arm64", "@img/sharp-libvips-linux-x64", "@img/sharp-win32-x64"]) {
      assert.equal(existsSync(join(root, gone)), false, gone);
    }
    const bindings = join(root, "@huggingface/transformers/node_modules/onnxruntime-node/bin/napi-v3");
    assert.equal(existsSync(join(bindings, "darwin/x64")), true);
    assert.equal(existsSync(join(bindings, "darwin/arm64")), false);
    assert.equal(existsSync(join(bindings, "win32")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a build without its own sharp or ONNX binary fails instead of shipping", () => {
  const root = tree(["@img/sharp-darwin-arm64", "@img/sharp-libvips-darwin-arm64", "onnxruntime-node/bin/napi-v3/darwin/arm64"]);
  try {
    assert.throws(() => assertNativeBinaries(root, "darwin", "x64"), /sharp-darwin-x64[\s\S]*sharp-libvips-darwin-x64[\s\S]*onnxruntime_binding/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Windows sharp bundles libvips, so no separate libvips package is required", () => {
  const root = tree(["@img/sharp-win32-x64", "@img/sharp-libvips-linux-x64"]);
  try {
    assert.doesNotThrow(() => assertNativeBinaries(root, "win32", "x64"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
