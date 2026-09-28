import Image from "next/image";
import Link from "next/link";
import { Cloud, Cpu, Laptop } from "lucide-react";
import { PrimaryDownload } from "@/components/download/primary-download";
import { DESKTOP_DOWNLOADS, DESKTOP_RELEASE_PAGE, DESKTOP_RELEASE_ROOT } from "@/lib/desktop-release";

export const metadata = {
  title: "Download for desktop",
  description: "Agent Commons for macOS, Windows, and Linux. Work in Cloud or keep everything on your computer.",
};

const FEATURES = [
  { icon: Cloud, title: "Cloud or Local", text: "Switch any time. Your agents and projects follow the mode you choose." },
  { icon: Laptop, title: "Private when you want it", text: "Local chats, files, and knowledge stay on this computer." },
  { icon: Cpu, title: "Local AI included", text: "A local model is set up the first time you use Local mode." },
];

export default function DesktopDownloadPage() {
  return (
    <main className="min-h-full overflow-y-auto bg-page">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-5 sm:px-6">
        <Link href="/" aria-label="Agent Commons" className="flex items-center">
          <Image src="/logo.jpg" alt="Agent Commons" width={131} height={60} priority className="h-8 w-auto rounded-md object-contain" />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <a href="https://docs.agentcommons.io/docs" target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-stone-600 transition-colors hover:bg-muted hover:text-stone-950">Docs</a>
          <Link href="/login" className="rounded-md px-3 py-1.5 font-medium text-stone-900 transition-colors hover:bg-muted">Log in</Link>
        </nav>
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center px-5 pb-10 pt-16 text-center sm:pt-24">
        <h1 className="font-space text-[1.7rem] font-medium leading-[1.2] tracking-[-0.03em] text-stone-950 sm:text-[2.2rem] sm:leading-[1.2]">
          Agent Commons for <span className="hl hl-mint">desktop</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-stone-600">
          Your agents, projects, and knowledge in one app. Work in Commons Cloud, or keep everything on your computer.
        </p>
        <div className="mt-8">
          <PrimaryDownload />
        </div>
      </section>

      <section className="mx-auto grid max-w-3xl gap-3 px-5 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-stone-200 bg-white p-4 shadow-card">
            <Icon className="h-4 w-4 text-stone-500" strokeWidth={1.75} />
            <p className="mt-3 text-sm font-medium text-stone-900">{title}</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">{text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-16 pt-10">
        <h2 className="text-xs font-medium uppercase tracking-wide text-stone-500">All downloads</h2>
        <div className="mt-3 divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {DESKTOP_DOWNLOADS.map((download) => (
            <a
              key={download.file}
              href={`${DESKTOP_RELEASE_ROOT}/${download.file}`}
              className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-stone-50"
            >
              <span className="text-stone-900">
                {download.label} <span className="text-stone-500">· {download.detail}</span>
              </span>
              <span className="text-xs text-stone-500">Download</span>
            </a>
          ))}
        </div>

        <details className="group mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer list-none text-stone-700 marker:hidden">
            First time opening it?
          </summary>
          <div className="mt-3 space-y-2 text-xs leading-5 text-stone-600">
            <p>This early release is not yet notarized. On macOS, drag Agent Commons to Applications, Control-click it, and choose Open. If macOS still blocks it, open System Settings, then Privacy &amp; Security, and choose Open Anyway.</p>
            <p>If an older download says the app is damaged, delete that file and download this version. Windows may ask you to confirm the download before it opens.</p>
            <p>Local AI downloads a verified runtime and model on first use: about 1 GB on macOS and up to 4 GB on Windows or Linux.</p>
          </div>
        </details>

        <p className="mt-4 text-xs leading-5 text-stone-500">
          Check downloads against the release checksums. Release notes and all builds are on the{" "}
          <a className="underline underline-offset-2 hover:text-stone-900" href={DESKTOP_RELEASE_PAGE}>desktop release page</a>.
        </p>
      </section>
    </main>
  );
}
