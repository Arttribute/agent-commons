"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Blocks, Pin, Search, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  GLOBAL_APPS_SCOPE,
  appsScopeForPath,
  appsScopeLabel,
  resolvePins,
  useCommonsApps,
} from "@/lib/commons-apps-store";
import { AppIcon } from "./app-icon";
import { pluginHasSurface, type UiPlugin } from "./types";

/**
 * Top-right apps bar: up to six pinned app icons plus a menu of every enabled
 * app, similar to browser extensions. Pins can be shared across pages or
 * customized for the current page.
 */
export function CommonsAppsBar({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const {
    plugins,
    layout,
    maxPinned,
    loaded,
    setPins,
    resetScope,
    openWindows,
    toggleWindow,
    focusWindow,
  } = useCommonsApps();
  const [menuOpen, setMenuOpen] = useState(false);

  const scope = appsScopeForPath(pathname);
  const activeApps = useMemo(
    () => plugins.filter((plugin) => plugin.status === "active"),
    [plugins],
  );
  const reviewCount = plugins.filter(
    (plugin) => plugin.status === "draft",
  ).length;
  const { pinned, customized } = resolvePins(layout, scope, plugins);
  const editScope = customized ? scope : GLOBAL_APPS_SCOPE;

  const openApp = useCallback(
    (plugin: UiPlugin, fromMenu = false) => {
      setMenuOpen(false);
      if (!pluginHasSurface(plugin, "widget")) {
        router.push(`/apps/${encodeURIComponent(plugin.slug)}`);
        return;
      }
      // From the menu, bring an open window forward instead of closing it.
      if (fromMenu && openWindows.includes(plugin.pluginId)) {
        focusWindow(plugin.pluginId);
      } else {
        toggleWindow(plugin.pluginId);
      }
    },
    [focusWindow, openWindows, router, toggleWindow],
  );

  const togglePin = async (plugin: UiPlugin) => {
    const current = pinned.map((item) => item.pluginId);
    const isPinned = current.includes(plugin.pluginId);
    if (!isPinned && current.length >= maxPinned) {
      toast({
        title: `You can pin up to ${maxPinned} apps`,
        description: "Unpin an app to make room.",
      });
      return;
    }
    const next = isPinned
      ? current.filter((id) => id !== plugin.pluginId)
      : [...current, plugin.pluginId];
    try {
      await setPins(editScope, next);
    } catch {
      toast({ title: "Could not update pinned apps", variant: "destructive" });
    }
  };

  const setScopeMode = async (pageOnly: boolean) => {
    try {
      if (pageOnly && !customized) {
        await setPins(
          scope,
          pinned.map((plugin) => plugin.pluginId),
        );
      } else if (!pageOnly && customized) {
        await resetScope(scope);
      }
    } catch {
      toast({ title: "Could not update pinned apps", variant: "destructive" });
    }
  };

  // Keep the header clean for people without any apps.
  if (!loaded || plugins.length === 0) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "flex h-9 flex-shrink-0 items-center gap-0.5 rounded-full border border-border bg-background px-1 shadow-card",
          className,
        )}
      >
        {pinned.map((plugin) => {
          const isOpen = openWindows.includes(plugin.pluginId);
          return (
            <Tooltip key={plugin.pluginId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={plugin.name}
                  aria-pressed={isOpen}
                  onClick={() => openApp(plugin)}
                  className={cn(
                    "relative flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-muted",
                    isOpen && "bg-muted",
                  )}
                >
                  <AppIcon plugin={plugin} size={18} />
                  {isOpen && (
                    <span className="absolute bottom-0.5 left-1/2 h-0.5 w-2 -translate-x-1/2 rounded-full bg-foreground/60" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {plugin.name}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {pinned.length > 0 && (
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
        )}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Apps"
                  className="relative flex h-7 w-7 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
                >
                  <Blocks className="h-4 w-4" strokeWidth={1.75} />
                  {reviewCount > 0 && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Apps
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
            <AppsMenu
              apps={activeApps}
              pinnedIds={pinned.map((plugin) => plugin.pluginId)}
              maxPinned={maxPinned}
              scopeLabel={appsScopeLabel(scope)}
              customized={customized}
              reviewCount={reviewCount}
              onOpen={(plugin) => openApp(plugin, true)}
              onTogglePin={togglePin}
              onScopeMode={setScopeMode}
              onNavigate={() => setMenuOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}

function AppsMenu({
  apps,
  pinnedIds,
  maxPinned,
  scopeLabel,
  customized,
  reviewCount,
  onOpen,
  onTogglePin,
  onScopeMode,
  onNavigate,
}: {
  apps: UiPlugin[];
  pinnedIds: string[];
  maxPinned: number;
  scopeLabel: string;
  customized: boolean;
  reviewCount: number;
  onOpen: (plugin: UiPlugin) => void;
  onTogglePin: (plugin: UiPlugin) => void;
  onScopeMode: (pageOnly: boolean) => void;
  onNavigate: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const visible = apps
    .filter(
      (plugin) =>
        !normalized ||
        plugin.name.toLowerCase().includes(normalized) ||
        plugin.description?.toLowerCase().includes(normalized),
    )
    .sort(
      (a, b) =>
        Number(pinnedIds.includes(b.pluginId)) -
          Number(pinnedIds.includes(a.pluginId)) ||
        a.name.localeCompare(b.name),
    );

  return (
    <div className="flex max-h-[min(520px,calc(100dvh-96px))] flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-sm font-medium">Apps</p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {pinnedIds.length}/{maxPinned} pinned
        </span>
      </div>

      <div className="px-3 pb-2">
        <div
          role="radiogroup"
          aria-label="Where pins apply"
          className="grid grid-cols-2 rounded-lg bg-muted p-0.5 text-xs"
        >
          {[
            { pageOnly: false, label: "All pages" },
            { pageOnly: true, label: `Only ${scopeLabel}` },
          ].map((option) => {
            const selected = option.pageOnly === customized;
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onScopeMode(option.pageOnly)}
                className={cn(
                  "truncate rounded-md px-2 py-1 transition-colors",
                  selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {apps.length > 6 && (
        <div className="relative px-3 pb-2">
          <Search className="pointer-events-none absolute left-5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps"
            aria-label="Search apps"
            className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {apps.length === 0
              ? "No apps are enabled yet."
              : "No apps match your search."}
          </p>
        ) : (
          visible.map((plugin) => {
            const isPinned = pinnedIds.includes(plugin.pluginId);
            const full = !isPinned && pinnedIds.length >= maxPinned;
            return (
              <div
                key={plugin.pluginId}
                className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-muted"
              >
                <button
                  type="button"
                  onClick={() => onOpen(plugin)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
                >
                  <AppIcon plugin={plugin} size={22} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {plugin.name}
                    </span>
                    {plugin.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {plugin.description}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={
                    isPinned ? `Unpin ${plugin.name}` : `Pin ${plugin.name}`
                  }
                  aria-pressed={isPinned}
                  title={
                    full
                      ? `Unpin an app first (max ${maxPinned})`
                      : isPinned
                        ? "Unpin"
                        : "Pin"
                  }
                  onClick={() => onTogglePin(plugin)}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-background",
                    isPinned
                      ? "text-foreground"
                      : "text-muted-foreground opacity-60 group-hover:opacity-100 focus-visible:opacity-100",
                    full && "cursor-not-allowed opacity-40",
                  )}
                >
                  {isPinned ? (
                    <Pin className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <Link
          href="/studio/customize/apps"
          onClick={onNavigate}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Manage apps
        </Link>
        {reviewCount > 0 && (
          <Link
            href="/studio/customize/apps"
            onClick={onNavigate}
            className="rounded-md px-1.5 py-1 text-xs text-amber-700 hover:bg-muted dark:text-amber-400"
          >
            {reviewCount} to review
          </Link>
        )}
      </div>
    </div>
  );
}
