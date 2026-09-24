import { cpSync, existsSync, lstatSync, readlinkSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Rewrite Next's absolute staging links to links within the packaged copy. */
export function relocateStandaloneLinks(sourceRoot, targetRoot) {
  const canonicalSourceRoot = realpathSync(sourceRoot);
  const externalCopies = new Map();
  const copiedPnpmWrappers = new Set();
  const inside = (root, path) => {
    const subpath = relative(root, path);
    return subpath !== ".." && !subpath.startsWith(`..${sep}`) && !isAbsolute(subpath);
  };
  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      const status = lstatSync(path);
      if (status.isSymbolicLink()) {
        const source = readlinkSync(path);
        if (!isAbsolute(source)) {
          if (!inside(targetRoot, resolve(dirname(path), source))) {
            throw new Error(`Standalone dependency points outside the bundle: ${path} -> ${source}`);
          }
          continue;
        }
        const canonicalSource = realpathSync(source);
        const kind = statSync(canonicalSource).isDirectory() ? "dir" : "file";
        if (!inside(canonicalSourceRoot, canonicalSource)) {
          // Windows Next builds sometimes link into the workspace pnpm store.
          // Keep the package's node_modules wrapper: Next resolves sibling
          // dependencies such as styled-jsx from that wrapper at runtime.
          const marker = `${sep}node_modules${sep}.pnpm${sep}`;
          const markerAt = canonicalSource.indexOf(marker);
          if (markerAt >= 0) {
            const pnpmRoot = canonicalSource.slice(0, markerAt + marker.length);
            const packageKey = canonicalSource.slice(markerAt + marker.length).split(sep)[0];
            const wrapperSource = join(pnpmRoot, packageKey, "node_modules");
            const wrapperTarget = join(targetRoot, "node_modules", ".pnpm", packageKey, "node_modules");
            const destination = join(wrapperTarget, relative(wrapperSource, canonicalSource));
            if (!copiedPnpmWrappers.has(wrapperSource)) {
              copiedPnpmWrappers.add(wrapperSource);
              // Replace Next's traced wrapper before copying. Windows cpSync
              // otherwise descends through junctions already in the target.
              rmSync(wrapperTarget, { recursive: true, force: true });
              cpSync(wrapperSource, wrapperTarget, { recursive: true, verbatimSymlinks: true });
              walk(wrapperTarget);
            }
            unlinkSync(path);
            symlinkSync(relative(dirname(path), destination), path, kind);
            continue;
          }
          const previous = externalCopies.get(canonicalSource);
          unlinkSync(path);
          if (previous) {
            symlinkSync(relative(dirname(path), previous), path, kind);
          } else {
            externalCopies.set(canonicalSource, path);
            cpSync(canonicalSource, path, { recursive: true, verbatimSymlinks: true });
            if (kind === "dir") walk(path);
          }
          continue;
        }
        const destination = join(targetRoot, relative(canonicalSourceRoot, canonicalSource));
        if (!existsSync(destination)) throw new Error(`Standalone dependency is missing: ${destination}`);
        unlinkSync(path);
        symlinkSync(relative(dirname(path), destination), path, kind);
      } else if (status.isDirectory()) {
        walk(path);
      }
    }
  }
  walk(targetRoot);
}
