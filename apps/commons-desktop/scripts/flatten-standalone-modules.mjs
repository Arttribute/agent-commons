import { cpSync, existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";

const MODULES = "node_modules";

function packageDirectory(path) {
  try {
    const real = realpathSync(path);
    return statSync(real).isDirectory() ? real : undefined;
  } catch {
    return undefined;
  }
}

/** [name, canonical directory] for each package a node_modules folder exposes. */
function packageEntries(modules) {
  if (!existsSync(modules)) return [];
  const entries = [];
  for (const entry of readdirSync(modules).sort()) {
    if (entry.startsWith(".")) continue;
    const path = join(modules, entry);
    const names = entry.startsWith("@") && packageDirectory(path)
      ? readdirSync(path).sort().filter((scoped) => !scoped.startsWith(".")).map((scoped) => [`${entry}/${scoped}`, join(path, scoped)])
      : [[entry, path]];
    for (const [name, location] of names) {
      const real = packageDirectory(location);
      if (real) entries.push([name, real]);
    }
  }
  return entries;
}

/** Directories outside node_modules that own a node_modules folder, relative to root. */
export function moduleOwners(root, directory = root) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === MODULES) found.push(relative(root, directory).split(sep).join("/"));
    else found.push(...moduleOwners(root, join(directory, entry.name)));
  }
  return found.sort();
}

const native = (root, location) => join(root, ...location.split("/").filter(Boolean));

/**
 * Copy the node_modules folders of Next's standalone output into the Desktop
 * bundle as an npm-style hoisted tree of real directories.
 *
 * pnpm links each package to its dependencies. Installers do not keep those
 * links: the Windows NSIS archive turns them into copies, so Next loses its
 * styled-jsx sibling and the app cannot start. A link-free tree also keeps
 * installed paths well under the Windows path limit.
 */
export function flattenStandaloneModules(sourceRoot, targetRoot) {
  const root = realpathSync(sourceRoot);
  const dependencyCache = new Map();
  // pnpm stores a package's resolved dependencies as siblings in its wrapper.
  // A package's own node_modules entries are nearer, so they win.
  function dependencies(real) {
    if (dependencyCache.has(real)) return dependencyCache.get(real);
    const resolved = new Map();
    const parent = dirname(real);
    const wrapper = basename(parent).startsWith("@") ? dirname(parent) : parent;
    if (basename(wrapper) === MODULES) {
      for (const [name, path] of packageEntries(wrapper)) if (path !== real) resolved.set(name, path);
    }
    for (const [name, path] of packageEntries(join(real, MODULES))) resolved.set(name, path);
    dependencyCache.set(real, resolved);
    return resolved;
  }

  const placed = new Map();
  const queue = [];
  // Follow Node's lookup: each ancestor's node_modules, nearest first.
  function resolveFrom(location, name) {
    for (let directory = location; ; directory = posix.dirname(directory) === "." ? "" : posix.dirname(directory)) {
      if (posix.basename(directory) !== MODULES) {
        const candidate = posix.join(directory, MODULES, name);
        if (placed.has(candidate)) return placed.get(candidate);
      }
      if (directory === "") return undefined;
    }
  }
  function add(location, real) {
    placed.set(location, real);
    queue.push(location);
  }
  // Hoist to the top level when the name is free there; otherwise nest the
  // package under the one that needs this version.
  function place(location, name, real) {
    const found = resolveFrom(location, name);
    if (found === real) return;
    add(found === undefined ? posix.join(MODULES, name) : posix.join(location, MODULES, name), real);
  }
  function hoist(name, real) {
    if (!placed.has(posix.join(MODULES, name))) add(posix.join(MODULES, name), real);
  }
  function drain() {
    while (queue.length) {
      const location = queue.shift();
      for (const [name, real] of dependencies(placed.get(location))) place(location, name, real);
    }
  }

  // The app's direct dependencies claim the top level first, then their
  // dependencies, then what pnpm hoisted, then any other traced package.
  for (const owner of moduleOwners(root)) {
    if (owner === "") continue;
    for (const [name, real] of packageEntries(native(root, `${owner}/${MODULES}`))) place(owner, name, real);
  }
  drain();
  const store = join(root, MODULES, ".pnpm");
  for (const modules of [join(root, MODULES), join(store, MODULES)]) {
    for (const [name, real] of packageEntries(modules)) hoist(name, real);
    drain();
  }
  if (existsSync(store)) {
    for (const key of readdirSync(store).sort()) {
      if (key === MODULES) continue;
      const wrapper = join(store, key, MODULES);
      for (const [name, real] of packageEntries(wrapper)) {
        if (dirname(real) === wrapper || dirname(dirname(real)) === wrapper) hoist(name, real);
      }
    }
    drain();
  }

  const depth = (location) => location.split("/").length;
  for (const location of [...placed.keys()].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))) {
    const source = placed.get(location);
    const nested = join(source, MODULES);
    cpSync(source, native(targetRoot, location), {
      recursive: true,
      dereference: true,
      filter: (path) => path !== nested && !path.startsWith(nested + sep),
    });
  }
  return placed;
}

/**
 * Throw unless the bundle has no links and the Next server resolves its
 * runtime dependencies from inside the bundle.
 */
export function assertPortableStandalone(bundleRoot, serverEntry) {
  const root = realpathSync(bundleRoot);
  const links = [];
  (function walk(directory) {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      const status = lstatSync(path);
      if (status.isSymbolicLink()) links.push(relative(root, path));
      else if (status.isDirectory()) walk(path);
    }
  })(root);
  if (links.length) throw new Error(`The packaged Commons app still contains links:\n${links.slice(0, 20).join("\n")}`);

  const resolveInside = (from, request) => {
    const resolved = realpathSync(createRequire(from).resolve(request));
    const subpath = relative(root, resolved);
    if (subpath.startsWith("..") || isAbsolute(subpath)) {
      throw new Error(`The packaged Commons app resolves ${request} outside the bundle: ${resolved}`);
    }
    return resolved;
  };
  const next = resolveInside(realpathSync(serverEntry), "next/package.json");
  for (const request of ["styled-jsx/package.json", "react/package.json", "react-dom/package.json", "@next/env"]) {
    resolveInside(next, request);
  }
}
