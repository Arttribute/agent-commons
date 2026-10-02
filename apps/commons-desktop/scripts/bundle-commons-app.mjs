import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPortableStandalone, flattenStandaloneModules, moduleOwners } from "./flatten-standalone-modules.mjs";
import { pruneBuildOnlyPackages } from "./prune-bundle.mjs";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commonsApp = resolve(desktop, "../commons-app");
const standalone = join(commonsApp, ".next", "standalone");
const target = join(desktop, "commons-app-dist");
const server = join(standalone, "apps", "commons-app", "server.js");

if (!existsSync(server)) {
  throw new Error("Build commons-app with COMMONS_DESKTOP_BUNDLE_APP=1 before bundling Desktop.");
}

rmSync(target, { recursive: true, force: true });
cpSync(standalone, target, {
  recursive: true,
  dereference: true,
  filter: (path) => basename(path) !== "node_modules",
});
flattenStandaloneModules(standalone, target);
for (const owner of moduleOwners(target)) {
  pruneBuildOnlyPackages(join(target, owner, "node_modules"));
}

const bundledApp = join(target, "apps", "commons-app");
mkdirSync(join(bundledApp, ".next"), { recursive: true });
cpSync(join(commonsApp, ".next", "static"), join(bundledApp, ".next", "static"), { recursive: true, dereference: true });
cpSync(join(commonsApp, "public"), join(bundledApp, "public"), { recursive: true, dereference: true });
assertPortableStandalone(target, join(bundledApp, "server.js"));
