"use client";

import type { ElementType } from "react";
import {
  AlertCircle,
  Bot,
  Brain,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  CreditCard,
  Database,
  FileText,
  FolderOpen,
  FolderTree,
  Github,
  Globe2,
  ListChecks,
  ListTodo,
  Mail,
  MessageSquare,
  MessagesSquare,
  Palette,
  PanelTopOpen,
  PlugZap,
  Presentation,
  Search,
  Table2,
  UsersRound,
  Workflow,
  Wrench,
} from "lucide-react";
import type { ToolCatalogItem } from "@/lib/tools/catalog";
import { getBrandIcon } from "@/lib/brand-icons";
import { cn } from "@/lib/utils";

const lucideMap: Record<string, ElementType> = {
  AlertCircle,
  Bot,
  Brain,
  CalendarDays,
  ClipboardList,
  Clock3,
  CreditCard,
  Database,
  FileText,
  FolderOpen,
  FolderTree,
  Github,
  Globe2,
  ListChecks,
  ListTodo,
  Mail,
  MessageSquare,
  MessagesSquare,
  Palette,
  PanelTopOpen,
  PlugZap,
  Presentation,
  Search,
  Table2,
  UsersRound,
  Workflow,
  Wrench,
};

/** Soft accent chip per category, used when no brand mark exists */
const categoryChip: Record<string, string> = {
  google_workspace: "bg-muted text-foreground",
  oauth: "bg-muted text-foreground",
  mcp_api: "bg-violet-100 text-violet-900 dark:bg-violet-300/15 dark:text-violet-200",
  system: "bg-blue-100 text-blue-900 dark:bg-blue-300/15 dark:text-blue-200",
  custom: "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-200",
};

const sizeStyles = {
  sm: { chip: "h-8 w-8 rounded-lg", brand: 16, lucide: "h-4 w-4", badge: "h-3.5 w-3.5" },
  md: { chip: "h-10 w-10 rounded-xl", brand: 20, lucide: "h-5 w-5", badge: "h-4 w-4" },
  lg: { chip: "h-12 w-12 rounded-2xl", brand: 24, lucide: "h-6 w-6", badge: "h-5 w-5" },
} as const;

export function ToolIcon({
  item,
  size = "md",
  showConnected = false,
  className,
}: {
  item: ToolCatalogItem;
  size?: keyof typeof sizeStyles;
  showConnected?: boolean;
  className?: string;
}) {
  const styles = sizeStyles[size];
  const brand = getBrandIcon(item.name, item.displayName);
  const Lucide = lucideMap[item.icon] ?? Wrench;
  const connected = showConnected && item.status === "connected";

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center",
          styles.chip,
          brand
            ? "border border-border bg-white dark:bg-zinc-900"
            : categoryChip[item.category] ?? "bg-muted text-foreground"
        )}
      >
        {brand ? (
          <brand.icon
            size={styles.brand}
            color={brand.monochrome ? "currentColor" : brand.hex}
            className={brand.monochrome ? "text-foreground" : undefined}
          />
        ) : (
          <Lucide className={styles.lucide} strokeWidth={1.9} />
        )}
      </div>
      {connected && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-background bg-emerald-500 text-white",
            styles.badge
          )}
          title="Connected"
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}
