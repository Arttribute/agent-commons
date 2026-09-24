import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commonsApp = resolve(desktop, "../commons-app");
const standalone = join(commonsApp, ".next", "standalone");
const target = join(desktop, "commons-app-dist");
const server = join(standalone, "apps", "commons-app", "server.js");

if (!existsSync(server)) {
  throw new Error("Build commons-app with COMMONS_DESKTOP_BUNDLE_APP=1 before bundling Desktop.");
}

rmSync(target, { recursive: true, force: true });
cpSync(standalone, target, { recursive: true });
const bundledApp = join(target, "apps", "commons-app");
mkdirSync(join(bundledApp, ".next"), { recursive: true });
cpSync(join(commonsApp, ".next", "static"), join(bundledApp, ".next", "static"), { recursive: true });
cpSync(join(commonsApp, "public"), join(bundledApp, "public"), { recursive: true });
