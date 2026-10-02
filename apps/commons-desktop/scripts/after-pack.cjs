const { execFileSync } = require("node:child_process");
const { cpSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

/**
 * Restore the bundled Next dependencies, then seal unsigned macOS builds.
 *
 * Modern Electron binaries contain linker signatures. Shipping the bundle
 * without sealing its resources makes Gatekeeper report the app as damaged.
 * A recursive ad-hoc signature preserves bundle integrity while Apple
 * Developer ID enrollment is pending. It does not replace notarization, so
 * users will still receive the expected unidentified-developer confirmation.
 */
module.exports = async function afterPack(context) {
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const resourcesPath = context.electronPlatformName === "darwin"
    ? path.join(appPath, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const bundle = path.join(__dirname, "..", "commons-app-dist");
  const packagedApp = path.join(resourcesPath, "commons-app");
  const { assertPortableStandalone, moduleOwners } = await import(
    pathToFileURL(path.join(__dirname, "flatten-standalone-modules.mjs")).href
  );
  // Electron Builder omits node_modules nested in extraResources by default.
  // The standalone Next server needs this dependency tree at runtime.
  for (const owner of moduleOwners(bundle)) {
    cpSync(path.join(bundle, owner, "node_modules"), path.join(packagedApp, owner, "node_modules"), {
      recursive: true,
      force: true,
    });
  }
  assertPortableStandalone(packagedApp, path.join(packagedApp, "apps", "commons-app", "server.js"));

  if (
    context.electronPlatformName !== "darwin" ||
    process.env.MAC_ADHOC_SIGN !== "true"
  ) {
    return;
  }

  execFileSync(
    "/usr/bin/codesign",
    ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath],
    { stdio: "inherit" },
  );
};
