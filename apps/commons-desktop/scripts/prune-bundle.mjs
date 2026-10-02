import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Packages the standalone Next server never loads. Next's server trace copies
 * them because they are installed, but only `next build` and `next dev` use
 * the SWC and esbuild compilers, TypeScript, and webpack with its minifier.
 */
export const BUILD_ONLY_PACKAGES = [
  "@esbuild",
  "esbuild",
  "terser",
  "terser-webpack-plugin",
  "ts-node",
  "typescript",
  "webpack",
];

/** Remove compilers and bundlers from a flattened node_modules tree. */
export function pruneBuildOnlyPackages(nodeModules) {
  const removed = [];
  for (const name of BUILD_ONLY_PACKAGES) {
    const path = join(nodeModules, name);
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
      removed.push(name);
    }
  }
  // @swc/helpers is a runtime dependency of Next; only the compiler goes.
  const swc = join(nodeModules, "@swc");
  if (existsSync(swc)) {
    for (const entry of readdirSync(swc)) {
      if (entry === "core" || entry.startsWith("core-")) {
        rmSync(join(swc, entry), { recursive: true, force: true });
        removed.push(`@swc/${entry}`);
      }
    }
  }
  return removed;
}

const SHARP_PACKAGE = /^sharp-(?:libvips-)?(darwin|linux|linuxmusl|win32)-([a-z0-9]+)$/;

/** Every node_modules directory under root, including nested ones. */
function* nodeModulesDirs(root) {
  if (!existsSync(root)) return;
  yield root;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packages = entry.name.startsWith("@")
      ? readdirSync(join(root, entry.name), { withFileTypes: true })
          .filter((child) => child.isDirectory())
          .map((child) => join(root, entry.name, child.name))
      : [join(root, entry.name)];
    for (const packageDir of packages) {
      yield* nodeModulesDirs(join(packageDir, "node_modules"));
    }
  }
}

/**
 * Keep only the native binaries one installer can load: sharp and libvips
 * for its platform and CPU, and the matching onnxruntime-node binding.
 */
export function pruneForeignNativeBinaries(root, platform, arch) {
  const removed = [];
  for (const nodeModules of nodeModulesDirs(root)) {
    const img = join(nodeModules, "@img");
    if (existsSync(img)) {
      for (const entry of readdirSync(img)) {
        const match = SHARP_PACKAGE.exec(entry);
        const foreign = entry === "sharp-wasm32" ||
          (match && (match[1] !== platform || match[2] !== arch));
        if (foreign) {
          rmSync(join(img, entry), { recursive: true, force: true });
          removed.push(join(img, entry));
        }
      }
    }
    const bindings = join(nodeModules, "onnxruntime-node", "bin", "napi-v3");
    if (existsSync(bindings)) {
      for (const os of readdirSync(bindings)) {
        for (const cpu of os === platform ? readdirSync(join(bindings, os)) : [null]) {
          if (os === platform && cpu === arch) continue;
          const path = cpu ? join(bindings, os, cpu) : join(bindings, os);
          rmSync(path, { recursive: true, force: true });
          removed.push(path);
        }
      }
    }
  }
  return removed;
}

/**
 * Fail the build when a native package lacks its binary for the target. An
 * Intel Mac build once shipped only the arm64 sharp, so local speech could
 * not load there while every arm64 smoke test passed. Run this before
 * pruning: the binaries for other platforms show where sharp was installed.
 */
export function assertNativeBinaries(root, platform, arch) {
  const missing = [];
  for (const nodeModules of nodeModulesDirs(root)) {
    const img = join(nodeModules, "@img");
    if (existsSync(img)) {
      const entries = readdirSync(img).filter((entry) => SHARP_PACKAGE.test(entry));
      const wanted = [
        entries.some((entry) => !entry.startsWith("sharp-libvips-")) && `sharp-${platform}-${arch}`,
        // Windows builds of sharp bundle libvips instead of depending on it.
        platform !== "win32" && entries.some((entry) => entry.startsWith("sharp-libvips-")) &&
          `sharp-libvips-${platform}-${arch}`,
      ].filter(Boolean);
      for (const name of wanted) {
        if (!entries.includes(name)) missing.push(join(img, name));
      }
    }
    const bindings = join(nodeModules, "onnxruntime-node", "bin", "napi-v3");
    if (existsSync(bindings) &&
        !existsSync(join(bindings, platform, arch, "onnxruntime_binding.node"))) {
      missing.push(join(bindings, platform, arch, "onnxruntime_binding.node"));
    }
  }
  if (missing.length) {
    throw new Error(`Native binaries for ${platform}-${arch} are missing:\n${missing.join("\n")}`);
  }
}
