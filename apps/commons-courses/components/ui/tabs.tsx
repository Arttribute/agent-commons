"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type TabItem<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
  hidden?: boolean;
};

const tabClass = (active: boolean) =>
  cn(
    "relative flex h-10 shrink-0 items-center gap-2 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
    active &&
      "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground",
  );

function TabContent({
  label,
  icon: Icon,
  count,
}: {
  label: string;
  icon?: LucideIcon;
  count?: number;
}) {
  return (
    <>
      {Icon ? <Icon className="h-4 w-4" strokeWidth={1.75} /> : null}
      {label}
      {count !== undefined ? (
        <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
          {count}
        </span>
      ) : null}
    </>
  );
}

/** Underline tabs driven by local state. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  label = "Sections",
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("flex items-center gap-1 overflow-x-auto border-b border-border", className)}
    >
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <button
            key={item.value}
            type="button"
            aria-current={item.value === value ? "page" : undefined}
            onClick={() => onChange(item.value)}
            className={tabClass(item.value === value)}
          >
            <TabContent {...item} />
          </button>
        ))}
    </nav>
  );
}

/**
 * Tabs that live in the URL (`?tab=`), so views are linkable and the copilot
 * can navigate straight to them.
 */
export function useQueryTab<T extends string>(values: readonly T[], fallback: T, key = "tab") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(key) as T | null;
  const value = raw && values.includes(raw) ? raw : fallback;
  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete(key);
      else params.set(key, next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [fallback, key, pathname, router, searchParams],
  );
  return [value, setValue] as const;
}

/** Route tabs: each tab is its own page. */
export function TabLinks({
  items,
  className,
  label = "Sections",
}: {
  items: Array<{ href: string; label: string; icon?: LucideIcon; match?: (pathname: string, search: string) => boolean }>;
  className?: string;
  label?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return (
    <nav
      aria-label={label}
      className={cn("flex items-center gap-1 overflow-x-auto border-b border-border", className)}
    >
      {items.map((item) => {
        const [path] = item.href.split("?");
        const active = item.match ? item.match(pathname, search) : pathname === path;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={tabClass(active)}
          >
            <TabContent label={item.label} icon={item.icon} />
          </Link>
        );
      })}
    </nav>
  );
}

/** Compact segmented control for switching between a few sibling views. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
  size = "md",
}: {
  items: Array<{ value: T; label: string; icon?: LucideIcon }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {items.map(({ value: itemValue, label, icon: Icon }) => (
        <button
          key={itemValue}
          type="button"
          role="tab"
          aria-selected={itemValue === value}
          onClick={() => onChange(itemValue)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium text-muted-foreground transition-colors hover:text-foreground",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
            itemValue === value && "bg-white text-foreground shadow-card",
          )}
        >
          {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
          {label}
        </button>
      ))}
    </div>
  );
}
