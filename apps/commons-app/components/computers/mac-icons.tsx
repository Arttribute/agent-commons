"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * macOS-style file and folder glyphs for the Finder view — solid, gradient-filled
 * icons that read like the real desktop rather than line icons. Gradient/clip ids
 * are made unique per instance with useId so many can render on one screen.
 */

export function MacFolderIcon({ className }: { className?: string }) {
  const id = useId();
  const back = `${id}-back`;
  const front = `${id}-front`;
  return (
    <svg viewBox="0 0 64 56" className={cn("drop-shadow-sm", className)} aria-hidden="true">
      <defs>
        <linearGradient id={back} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5AA8F7" />
          <stop offset="1" stopColor="#2E7DEA" />
        </linearGradient>
        <linearGradient id={front} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93C8FF" />
          <stop offset="1" stopColor="#4A93F5" />
        </linearGradient>
      </defs>
      {/* Back panel + tab */}
      <path
        d="M4 13a5 5 0 0 1 5-5h11.3a4 4 0 0 1 2.83 1.17l2.83 2.83a2 2 0 0 0 1.41.59H55a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"
        fill={`url(#${back})`}
      />
      {/* Front flap */}
      <path
        d="M4 21h56v22a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"
        fill={`url(#${front})`}
      />
      {/* Glossy top edge on the flap */}
      <path d="M4 21h56v1.5H4z" fill="#ffffff" opacity="0.35" />
    </svg>
  );
}

export function MacFileIcon({ name, className }: { name: string; className?: string }) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const hasExt = ext.length > 0 && ext.length <= 4 && ext !== name.toLowerCase();
  const badge = fileBadge(ext);
  return (
    <svg viewBox="0 0 52 64" className={cn("drop-shadow-sm", className)} aria-hidden="true">
      {/* Page */}
      <path
        d="M8 4h24.7a3 3 0 0 1 2.12.88l12.3 12.3A3 3 0 0 1 48 19.3V57a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"
        fill="#ffffff"
        stroke="#d9dee5"
        strokeWidth="1.2"
      />
      {/* Folded corner */}
      <path d="M33 4.6 47.4 19H36a3 3 0 0 1-3-3z" fill="#e7ebf1" stroke="#d9dee5" strokeWidth="1.2" strokeLinejoin="round" />
      {hasExt ? (
        <>
          <rect x="9" y="38" width="34" height="13" rx="3" fill={badge} />
          <text
            x="26"
            y="47.6"
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="700"
            letterSpacing="0.3"
            fill="#ffffff"
            fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          >
            {ext.toUpperCase()}
          </text>
        </>
      ) : (
        <>
          <rect x="12" y="34" width="28" height="2.4" rx="1.2" fill="#dfe4ea" />
          <rect x="12" y="41" width="28" height="2.4" rx="1.2" fill="#dfe4ea" />
          <rect x="12" y="48" width="18" height="2.4" rx="1.2" fill="#dfe4ea" />
        </>
      )}
    </svg>
  );
}

/** Solid file-type colour for the document badge, by extension. */
function fileBadge(ext: string): string {
  const map: Record<string, string> = {
    ts: "#3178C6",
    tsx: "#3178C6",
    js: "#CA9A16",
    jsx: "#CA9A16",
    mjs: "#CA9A16",
    cjs: "#CA9A16",
    json: "#6B7280",
    md: "#0EA5E9",
    mdx: "#0EA5E9",
    css: "#7C3AED",
    scss: "#7C3AED",
    html: "#EA580C",
    xml: "#EA580C",
    svg: "#DB2777",
    png: "#DB2777",
    jpg: "#DB2777",
    jpeg: "#DB2777",
    gif: "#DB2777",
    webp: "#DB2777",
    py: "#2563EB",
    rs: "#C2410C",
    go: "#0891B2",
    rb: "#DC2626",
    sh: "#16A34A",
    bash: "#16A34A",
    zsh: "#16A34A",
    yml: "#4B5563",
    yaml: "#4B5563",
    toml: "#4B5563",
    sql: "#0D9488",
    pdf: "#DC2626",
    txt: "#64748B",
    env: "#0F766E",
    lock: "#57534E",
  };
  return map[ext] ?? "#64748B";
}
