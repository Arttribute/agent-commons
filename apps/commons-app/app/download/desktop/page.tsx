import Link from "next/link";

// Keep desktop downloads pinned to a desktop release. The repository also
// publishes CLI and VS Code releases, so GitHub's repository-wide `latest`
// redirect can point at a release that does not contain desktop installers.
const desktopReleaseTag = "desktop-v0.3.0";
const releaseRoot = `https://github.com/Arttribute/agent-commons/releases/download/${desktopReleaseTag}`;

const downloads = [
  { label: "macOS — Apple silicon", detail: "M1, M2, M3, M4, and newer", file: "Agent-Commons-mac-arm64.dmg" },
  { label: "macOS — Intel", detail: "Intel-based Macs", file: "Agent-Commons-mac-x64.dmg" },
  { label: "Windows", detail: "64-bit installer", file: "Agent-Commons-win-x64.exe" },
  { label: "Linux", detail: "64-bit AppImage", file: "Agent-Commons-linux-x86_64.AppImage" },
];

export default function DesktopDownloadPage() {
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-16">
        <Link href="/" className="mb-12 text-sm text-muted-foreground hover:text-foreground">← Agent Commons</Link>
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Agent Commons Desktop · version 0.3.0</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">One Commons workspace. Cloud or Private Local.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
          Use the same Commons interface in Cloud or Private Local. Local chats, agents, files, Knowledge Spaces, and model inference stay on this computer. Cloud access to desktop files and commands is configurable.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Local AI is set up automatically the first time you use it. The one-time verified runtime and model download is about 1 GB on macOS and can use up to 4 GB on Windows or Linux.
        </p>
        <aside className="mt-8 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>Early release:</strong> publisher enrollment is still in progress, so this version is not yet notarized or publisher-signed. On macOS, drag Agent Commons to Applications, Control-click it, and choose Open. If macOS still blocks it, use System Settings → Privacy &amp; Security → Open Anyway. If an older download says the app is damaged, delete that DMG and download this latest release. Windows SmartScreen may also ask you to confirm the download before opening it.
        </aside>
        <section className="mt-10 grid gap-3 sm:grid-cols-2">
          {downloads.map((download) => (
            <a key={download.file} href={`${releaseRoot}/${download.file}`} className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent">
              <strong className="block text-sm">{download.label}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">{download.detail}</span>
              <span className="mt-5 block text-sm font-medium">Download →</span>
            </a>
          ))}
        </section>
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Private Local keeps Commons data and model inference on your computer. Agent commands require your permission and can use your computer&apos;s network. Verify the download against the release checksums. See all builds and release notes on the{" "}
          <a className="underline" href={`https://github.com/Arttribute/agent-commons/releases/tag/${desktopReleaseTag}`}>desktop release</a>.
        </p>
      </div>
    </main>
  );
}
