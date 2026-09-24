import { cpSync, existsSync, lstatSync, readlinkSync, readdirSync, realpathSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Rewrite Next's absolute staging links to links within the packaged copy. */
export function relocateStandaloneLinks(sourceRoot, targetRoot) {
  const canonicalSourceRoot = realpathSync(sourceRoot);
  const externalCopies = new Map();
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
          // Windows Next builds sometimes link directly to pnpm's workspace
          // store instead of to the standalone staging tree.
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
