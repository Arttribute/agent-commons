"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronsUpDown,
  ExternalLink,
  FlaskConical,
  GraduationCap,
  LogOut,
  Menu,
  PanelLeft,
  PanelRight,
  Plus,
  Settings,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  consoleSections,
  courseHref,
  courseSectionGroups,
  courseSections,
  parseCoursePath,
  sectionForSegment,
} from "@/lib/educator-nav";
import { Popover, MenuItem } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";

export type ShellCourse = { slug: string; title: string; published: boolean };

const COLLAPSE_KEY = "commonlab-educator-sidebar-collapsed";

/**
 * Educator console frame, modelled on the Agent Commons studio: one quiet
 * sidebar (console pages, or the open course's sections), the account menu
 * pinned to the bottom, and a single scrolling content area.
 */
export function EducatorShell({
  courses,
  children,
}: {
  courses: ShellCourse[];
  children: ReactNode;
}) {
  const pathname = usePathname() || "/educator";
  const coursePath = parseCoursePath(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Full-screen studios take the whole viewport.
  const bare = pathname.startsWith("/educator/experience-studio");
  // Running a live room benefits from the extra width.
  const focusRoute = /^\/educator\/courses\/[^/]+\/live\/[^/]+/.test(pathname);
  const railOnly = collapsed || focusRoute;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") {
        const timer = window.setTimeout(() => setCollapsed(true), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Storage can be unavailable; the sidebar simply starts expanded.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      } catch {
        // Ignore storage failures.
      }
      return !value;
    });
  }

  if (bare) return <>{children}</>;

  const currentCourse = coursePath
    ? courses.find((course) => course.slug === coursePath.slug) || {
        slug: coursePath.slug,
        title: coursePath.slug.replace(/-/g, " "),
        published: false,
      }
    : null;

  return (
    <div className="flex h-dvh overflow-hidden bg-page text-foreground">
      {mobileOpen ? (
        <div
          className="ui-fade-in fixed inset-0 z-40 bg-stone-950/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-border bg-white transition-[width,transform] duration-200 lg:static lg:z-auto lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          railOnly ? "lg:w-[60px]" : "lg:w-[264px]",
        )}
      >
        <SidebarTop
          railOnly={railOnly}
          canToggle={!focusRoute}
          onToggle={toggleCollapsed}
        />

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {currentCourse && coursePath ? (
            <CourseNav
              course={currentCourse}
              courses={courses}
              segment={coursePath.segment}
              railOnly={railOnly}
            />
          ) : (
            <ConsoleNav pathname={pathname} railOnly={railOnly} courses={courses} />
          )}
        </nav>

        <SidebarAccount railOnly={railOnly} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-white px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <span className="truncate text-sm font-medium">
            {currentCourse?.title || "Educator console"}
          </span>
        </div>
        <main id="educator-main" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarTop({
  railOnly,
  canToggle,
  onToggle,
}: {
  railOnly: boolean;
  canToggle: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center px-3",
        railOnly ? "lg:justify-center" : "justify-between",
      )}
    >
      <Link
        href="/educator"
        className={cn("flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1", railOnly && "lg:hidden")}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-900 text-white">
          <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <span className="truncate text-sm font-medium tracking-tight">CommonLab</span>
      </Link>
      {canToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={railOnly ? "Expand sidebar" : "Collapse sidebar"}
          title={railOnly ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
        >
          {railOnly ? (
            <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelRight className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      ) : (
        <Link
          href="/educator"
          aria-label="Educator console"
          className="hidden h-7 w-7 items-center justify-center rounded-md bg-stone-900 text-white lg:flex"
        >
          <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
        </Link>
      )}
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  railOnly,
}: {
  href: string;
  icon: typeof BookOpen;
  label: string;
  active: boolean;
  railOnly: boolean;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-stone-600 hover:bg-muted hover:text-foreground",
        railOnly && "lg:justify-center lg:px-0",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className={cn("truncate", railOnly && "lg:hidden")}>{label}</span>
    </Link>
  );
  return railOnly ? (
    <Tooltip label={label} side="right" className="flex w-full">
      <span className="block w-full">{link}</span>
    </Tooltip>
  ) : (
    link
  );
}

function ConsoleNav({
  pathname,
  railOnly,
  courses,
}: {
  pathname: string;
  railOnly: boolean;
  courses: ShellCourse[];
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-0.5">
        {consoleSections.map((section) => (
          <NavLink
            key={section.href}
            href={section.href}
            icon={section.icon}
            label={section.label}
            railOnly={railOnly}
            active={
              section.exact
                ? pathname === section.href
                : pathname === section.href || pathname.startsWith(`${section.href}/`)
            }
          />
        ))}
      </div>
      {courses.length && !railOnly ? (
        <div>
          <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">Recent courses</p>
          <div className="space-y-0.5">
            {courses.slice(0, 6).map((course) => (
              <Link
                key={course.slug}
                href={courseHref(course.slug, "")}
                className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-stone-600 transition-colors hover:bg-muted hover:text-foreground"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    course.published ? "bg-emerald-500" : "bg-stone-300",
                  )}
                />
                <span className="truncate">{course.title}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CourseNav({
  course,
  courses,
  segment,
  railOnly,
}: {
  course: ShellCourse;
  courses: ShellCourse[];
  segment: string;
  railOnly: boolean;
}) {
  const active = sectionForSegment(segment);
  const grouped = useMemo(
    () =>
      courseSectionGroups.map((group) => ({
        ...group,
        items: courseSections.filter((section) => section.group === group.key),
      })),
    [],
  );

  return (
    <div className="space-y-4">
      {railOnly ? (
        <div className="hidden lg:block">
          <NavLink
            href="/educator/courses"
            icon={ArrowLeft}
            label="All courses"
            active={false}
            railOnly
          />
        </div>
      ) : null}
      <div className={cn(railOnly && "lg:hidden")}>
        <CourseSwitcher course={course} courses={courses} />
      </div>
      {grouped.map((group) => (
        <div key={group.key || "top"}>
          {group.label && !railOnly ? (
            <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
          ) : null}
          <div className="space-y-0.5">
            {group.items.map((section) => (
              <NavLink
                key={section.key}
                href={courseHref(course.slug, section.href)}
                icon={section.icon}
                label={section.label}
                railOnly={railOnly}
                active={active.key === section.key}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CourseSwitcher({ course, courses }: { course: ShellCourse; courses: ShellCourse[] }) {
  return (
    <Popover
      align="start"
      className="w-[240px] p-1.5"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex w-[240px] items-center gap-2.5 rounded-lg border border-border bg-white px-2.5 py-2 text-left shadow-card transition-colors hover:bg-muted"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-highlight text-xs font-medium text-stone-900">
            {course.title.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium capitalize">{course.title}</span>
            <span className="block text-xs text-muted-foreground">
              {course.published ? "Published" : "Draft"}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="max-h-72 overflow-y-auto">
            {courses.map((item) => (
              <Link
                key={item.slug}
                href={courseHref(item.slug, "")}
                onClick={close}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.slug === course.slug ? (
                  <Check className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                ) : null}
              </Link>
            ))}
          </div>
          <div className="mt-1 border-t border-border pt-1">
            <Link
              href="/educator/courses"
              onClick={close}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-stone-600 transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              All courses
            </Link>
            <Link
              href={`/courses/${course.slug}`}
              onClick={close}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-stone-600 transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
              View public page
            </Link>
            <Link
              href="/educator/courses/new"
              onClick={close}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-stone-600 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              New course
            </Link>
          </div>
        </div>
      )}
    </Popover>
  );
}

function SidebarAccount({ railOnly }: { railOnly: boolean }) {
  const { data: session } = useSession();
  const name = session?.user?.name || session?.user?.email || "Account";
  const initial = name.slice(0, 1).toUpperCase();
  const avatar = session?.user?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={session.user.image} alt="" className="h-full w-full object-cover" />
  ) : (
    initial
  );

  return (
    <div className="shrink-0 border-t border-border p-3">
      <Popover
        side="top"
        align="start"
        className="w-60 p-1.5"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label="Account menu"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted",
              railOnly && "lg:justify-center",
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-xs font-medium text-white">
              {avatar}
            </span>
            <span className={cn("min-w-0 flex-1", railOnly && "lg:hidden")}>
              <span className="block truncate text-sm">{name}</span>
              <span className="block text-xs text-muted-foreground">Educator</span>
            </span>
          </button>
        )}
      >
        {({ close }) => (
          <div>
            {session?.user?.email ? (
              <p className="truncate px-2.5 py-2 text-xs text-muted-foreground">{session.user.email}</p>
            ) : null}
            <AccountLink href="/dashboard" icon={GraduationCap} onClick={close}>
              Learner dashboard
            </AccountLink>
            <AccountLink href="/courses" icon={BookOpen} onClick={close}>
              Browse courses
            </AccountLink>
            <AccountLink href="/educator/settings" icon={Settings} onClick={close}>
              Educator settings
            </AccountLink>
            <AccountLink href="/account" icon={UserRound} onClick={close}>
              Account
            </AccountLink>
            <div className="mt-1 border-t border-border pt-1">
              <MenuItem icon={LogOut} onClick={() => signOut()}>
                Sign out
              </MenuItem>
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}

function AccountLink({
  href,
  icon: Icon,
  onClick,
  children,
}: {
  href: string;
  icon: typeof BookOpen;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 opacity-70" strokeWidth={1.75} />
      {children}
    </Link>
  );
}
