"use client";

import type { ElementType } from "react";
import {
  BarChart3,
  Bot,
  Brain,
  Calendar,
  Code2,
  Database,
  FileSpreadsheet,
  FileText,
  FileType,
  Folder,
  Github,
  Globe,
  Image,
  Layers,
  Link2,
  Mail,
  MessageSquare,
  Monitor,
  PanelsTopLeft,
  PenLine,
  Presentation,
  Search,
  Send,
  Settings2,
  Table2,
  Terminal,
  Users,
  Video,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Skills store `icon` as either a Lucide icon name (platform skills seed
 * kebab-case names like `panels-top-left`) or a single emoji (what the create
 * form asks users for). Anything unrecognised falls back to the Zap mark
 * rather than leaking a raw slug into the layout.
 */
const lucideByName: Record<string, ElementType> = {
  "bar-chart-3": BarChart3,
  bot: Bot,
  brain: Brain,
  calendar: Calendar,
  "code-2": Code2,
  code: Code2,
  database: Database,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  "file-type": FileType,
  folder: Folder,
  github: Github,
  globe: Globe,
  image: Image,
  layers: Layers,
  "link-2": Link2,
  mail: Mail,
  "message-square": MessageSquare,
  monitor: Monitor,
  "panels-top-left": PanelsTopLeft,
  "pen-line": PenLine,
  presentation: Presentation,
  search: Search,
  send: Send,
  "settings-2": Settings2,
  "table-2": Table2,
  terminal: Terminal,
  users: Users,
  video: Video,
  workflow: Workflow,
  wrench: Wrench,
  zap: Zap,
};

/** `PanelsTopLeft` / `panelsTopLeft` / `Panels Top Left` → `panels-top-left`. */
function toKebabCase(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/** Emoji and other pictographs are safe to render as text; slugs are not. */
function isGlyph(value: string) {
  const glyph = value.trim();
  if (!glyph || /[a-zA-Z0-9]/.test(glyph)) return false;
  return Array.from(glyph).length <= 2;
}

const sizeStyles = {
  sm: { chip: "h-7 w-7 rounded-md", glyph: "text-sm", lucide: "h-3.5 w-3.5" },
  md: { chip: "h-9 w-9 rounded-lg", glyph: "text-base", lucide: "h-4 w-4" },
  lg: { chip: "h-11 w-11 rounded-xl", glyph: "text-lg", lucide: "h-5 w-5" },
} as const;

export function SkillIcon({
  icon,
  size = "md",
  className,
}: {
  icon?: string | null;
  size?: keyof typeof sizeStyles;
  className?: string;
}) {
  const styles = sizeStyles[size];
  const raw = icon?.trim() ?? "";
  const Lucide = raw ? lucideByName[toKebabCase(raw)] : undefined;
  const glyph = !Lucide && isGlyph(raw) ? raw : null;
  const Fallback = Zap;

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-amber-100 leading-none text-amber-900 dark:bg-amber-300/15 dark:text-amber-200",
        styles.chip,
        className
      )}
    >
      {glyph ? (
        <span className={styles.glyph}>{glyph}</span>
      ) : Lucide ? (
        <Lucide className={styles.lucide} strokeWidth={1.9} />
      ) : (
        <Fallback className={styles.lucide} strokeWidth={1.9} />
      )}
    </span>
  );
}
