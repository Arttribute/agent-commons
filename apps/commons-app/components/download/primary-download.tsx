"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { DESKTOP_DOWNLOADS, DESKTOP_RELEASE_ROOT, DESKTOP_VERSION, type DesktopDownload } from "@/lib/desktop-release";

async function detectPlatform(): Promise<DesktopDownload["id"]> {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }> } };
  const platform = (nav.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("linux") && !platform.includes("android")) return "linux";
  if (platform.includes("mac")) {
    const architecture = await nav.userAgentData?.getHighEntropyValues?.(["architecture"]).then((values) => values.architecture).catch(() => undefined);
    if (architecture === "x86") return "mac-x64";
    return "mac-arm64";
  }
  return "mac-arm64";
}

/** The one download most visitors need, chosen for their computer. */
export function PrimaryDownload() {
  const [platform, setPlatform] = useState<DesktopDownload["id"]>("mac-arm64");
  useEffect(() => { void detectPlatform().then(setPlatform); }, []);
  const download = DESKTOP_DOWNLOADS.find((entry) => entry.id === platform) ?? DESKTOP_DOWNLOADS[0];
  return (
    <div className="flex flex-col items-center gap-2">
      <a
        href={`${DESKTOP_RELEASE_ROOT}/${download.file}`}
        className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-card transition-colors hover:bg-neutral-700"
      >
        <Download className="h-4 w-4" />
        Download for {download.label}
        <span className="text-white/60">· {download.detail}</span>
      </a>
      <span className="text-xs text-stone-500">Version {DESKTOP_VERSION}</span>
    </div>
  );
}
