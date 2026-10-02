const { execFileSync } = require("node:child_process");
const { cpSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// electron-builder passes its Arch enum; map it to Node's process.arch names.
const ARCH_NAMES = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64" };

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

  // Ship each installer only the native binaries it can load. Check first:
  // the binaries for other targets show where each native package lives.
  const arch = ARCH_NAMES[context.arch];
  if (arch) {
    const { assertNativeBinaries, pruneForeignNativeBinaries } = await import(
      pathToFileURL(path.join(__dirname, "prune-bundle.mjs")).href
    );
    const nativeRoots = [
      ...moduleOwners(bundle).map((owner) => path.join(packagedApp, owner, "node_modules")),
      path.join(resourcesPath, "app.asar.unpacked", "node_modules"),
    ];
    for (const root of nativeRoots) {
      assertNativeBinaries(root, context.electronPlatformName, arch);
      pruneForeignNativeBinaries(root, context.electronPlatformName, arch);
    }
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
