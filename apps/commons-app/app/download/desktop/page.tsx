import Link from "next/link";

const releaseRoot = "https://github.com/Arttribute/agent-commons/releases/latest/download";

const downloads = [
  { label: "macOS — Apple silicon", detail: "M1, M2, M3, M4, and newer", file: "Agent-Commons-mac-arm64.dmg" },
  { label: "macOS — Intel", detail: "Intel-based Macs", file: "Agent-Commons-mac-x64.dmg" },
  { label: "Windows", detail: "64-bit installer", file: "Agent-Commons-win-x64.exe" },
  { label: "Linux", detail: "64-bit AppImage", file: "Agent-Commons-linux-x64.AppImage" },
];

export default function DesktopDownloadPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-12 text-sm text-muted-foreground hover:text-foreground">← Agent Commons</Link>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Agent Commons Desktop</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Cloud when you want it. Fully local when you need it.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
        Use the live Commons workspace, or switch to Private Local for on-device models, files, terminal commands, Git, Knowledge Spaces, workflows, and app previews.
      </p>
      <aside className="mt-8 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>Early release:</strong> these installers are currently unsigned while publisher enrollment is completed. macOS Gatekeeper or Windows SmartScreen may ask you to confirm the download before opening it.
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
        Private Local data stays on your computer. Local tools ask before editing files or running commands. Verify the download against the release checksums. See all builds and release notes on the{" "}
        <a className="underline" href="https://github.com/Arttribute/agent-commons/releases/latest">latest release</a>.
      </p>
    </main>
  );
}
