"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { UiPlugin } from "./types";

const MONOGRAM_TONES = [
  "bg-amber-100 text-amber-900",
  "bg-pink-100 text-pink-900",
  "bg-emerald-100 text-emerald-900",
  "bg-cyan-100 text-cyan-900",
  "bg-blue-100 text-blue-900",
  "bg-violet-100 text-violet-900",
];

/**
 * App icons are data URLs validated by the API (or shipped SVGs converted on
 * registration), rendered only through <img> so they cannot run script.
 */
export function AppIcon({
  plugin,
  size = 20,
  className,
}: {
  plugin: Pick<UiPlugin, "pluginId" | "name" | "iconUrl">;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const iconUrl = plugin.iconUrl;
  const safeIcon =
    iconUrl && !failed && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(iconUrl)
      ? iconUrl
      : null;

  if (safeIcon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={safeIcon}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-[22%] object-contain", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const tone =
    MONOGRAM_TONES[
      [...plugin.pluginId].reduce((total, char) => total + char.charCodeAt(0), 0) %
        MONOGRAM_TONES.length
    ];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[22%] font-medium leading-none",
        tone,
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {plugin.name.trim().charAt(0).toUpperCase() || "A"}
    </span>
  );
}
