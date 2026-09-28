// Keep desktop downloads pinned to a desktop release. The repository also
// publishes CLI and VS Code releases, so GitHub's repository-wide `latest`
// redirect can point at a release that does not contain desktop installers.
export const DESKTOP_VERSION = "0.4.0";
export const DESKTOP_RELEASE_TAG = `desktop-v${DESKTOP_VERSION}`;
export const DESKTOP_RELEASE_ROOT = `https://github.com/Arttribute/agent-commons/releases/download/${DESKTOP_RELEASE_TAG}`;
export const DESKTOP_RELEASE_PAGE = `https://github.com/Arttribute/agent-commons/releases/tag/${DESKTOP_RELEASE_TAG}`;

export type DesktopDownload = {
  id: "mac-arm64" | "mac-x64" | "windows" | "linux";
  label: string;
  detail: string;
  file: string;
};

export const DESKTOP_DOWNLOADS: DesktopDownload[] = [
  { id: "mac-arm64", label: "macOS", detail: "Apple silicon", file: "Agent-Commons-mac-arm64.dmg" },
  { id: "mac-x64", label: "macOS", detail: "Intel", file: "Agent-Commons-mac-x64.dmg" },
  { id: "windows", label: "Windows", detail: "64-bit", file: "Agent-Commons-win-x64.exe" },
  { id: "linux", label: "Linux", detail: "AppImage", file: "Agent-Commons-linux-x86_64.AppImage" },
];
