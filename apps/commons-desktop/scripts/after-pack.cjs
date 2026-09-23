const { execFileSync } = require("node:child_process");
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
  if (
    context.electronPlatformName !== "darwin" ||
    process.env.MAC_ADHOC_SIGN !== "true"
  ) {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  execFileSync(
    "/usr/bin/codesign",
    ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath],
    { stdio: "inherit" },
  );
};
