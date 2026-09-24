import { existsSync, lstatSync, readlinkSync, readdirSync, realpathSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

/** Rewrite Next's absolute staging links to links within the packaged copy. */
export function relocateStandaloneLinks(sourceRoot, targetRoot) {
  const canonicalSourceRoot = realpathSync(sourceRoot);
  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      const status = lstatSync(path);
      if (status.isSymbolicLink()) {
        const source = readlinkSync(path);
        if (!isAbsolute(source)) continue;
        const subpath = relative(canonicalSourceRoot, realpathSync(source));
        if (subpath === ".." || subpath.startsWith(`..${sep}`) || isAbsolute(subpath)) {
          throw new Error(`Standalone dependency points outside the bundle: ${path}`);
        }
        const destination = join(targetRoot, subpath);
        if (!existsSync(destination)) throw new Error(`Standalone dependency is missing: ${destination}`);
        const kind = statSync(destination).isDirectory() ? "dir" : "file";
        unlinkSync(path);
        symlinkSync(relative(dirname(path), destination), path, kind);
      } else if (status.isDirectory()) {
        walk(path);
      }
    }
  }
  walk(targetRoot);
}
