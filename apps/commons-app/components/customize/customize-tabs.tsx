"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppWindow, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  {
    label: "Apps",
    href: "/studio/customize/apps",
    segment: "/studio/customize/apps",
    icon: AppWindow,
  },
  {
    label: "Skills",
    href: "/studio/customize/skills",
    segment: "/studio/customize/skills",
    icon: Sparkles,
  },
] as const;

export function CustomizeTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Customize sections"
      className="border-b border-border/70 px-4 sm:px-6"
    >
      <div className="flex items-center gap-1">
        {tabs.map(({ label, href, segment, icon: Icon }) => {
          const active = pathname?.startsWith(segment);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center gap-2 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
                active &&
                  "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
