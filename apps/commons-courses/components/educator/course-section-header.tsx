"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/surface";
import {
  courseHref,
  courseSections,
  parseCoursePath,
  type CourseSectionKey,
} from "@/lib/educator-nav";

function splitHref(href: string) {
  const [segment, query = ""] = href.split("?");
  return { segment, tab: new URLSearchParams(query).get("tab") };
}

/**
 * Header for a course section: the section title, an optional info tip and
 * the tabs for its sibling views. Keeps every section on one pattern.
 */
export function CourseSectionHeader({
  section,
  title,
  info,
  actions,
  meta,
  hideTabs,
}: {
  section: CourseSectionKey;
  title?: string;
  info?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  hideTabs?: boolean;
}) {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const course = parseCoursePath(pathname);
  const config = courseSections.find((item) => item.key === section);
  const views = config?.views || [];
  const currentTab = searchParams.get("tab");

  return (
    <div className="mb-6">
      <PageHeader
        title={title || config?.label || ""}
        info={info}
        actions={actions}
        meta={meta}
        className={views.length && !hideTabs ? "mb-3" : "mb-0"}
      />
      {course && views.length && !hideTabs ? (
        <nav
          aria-label={`${config?.label} views`}
          className="flex items-center gap-1 overflow-x-auto border-b border-border"
        >
          {views.map((view) => {
            const target = splitHref(view.href);
            const siblingTabs = views
              .map((item) => splitHref(item.href))
              .filter((item) => item.segment === target.segment && item.tab)
              .map((item) => item.tab);
            const active =
              course.segment === target.segment &&
              (target.tab
                ? currentTab === target.tab
                : !currentTab || !siblingTabs.includes(currentTab));
            return (
              <Link
                key={view.href}
                href={courseHref(course.slug, view.href)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 shrink-0 items-center px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active &&
                    "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground",
                )}
              >
                {view.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
