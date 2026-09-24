const { execFileSync } = require("node:child_process");
const { cpSync, existsSync } = require("node:fs");
const path = require("node:path");

/**
 * Give unsigned macOS builds a complete ad-hoc seal.
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
  const bundledModules = path.join(__dirname, "..", "commons-app-dist", "node_modules");
  const packagedModules = path.join(resourcesPath, "commons-app", "node_modules");
  // Electron Builder omits node_modules nested in extraResources by default.
  // The standalone Next server needs this dependency tree at runtime.
  cpSync(bundledModules, packagedModules, { recursive: true, force: true, verbatimSymlinks: true });
  if (!existsSync(path.join(resourcesPath, "commons-app", "apps", "commons-app", "node_modules", "next", "package.json"))) {
    throw new Error("Packaged Commons app cannot resolve Next.js.");
  }

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
