"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Gift,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type CourseDashboardShellProps = {
  slug: string;
  title: string;
  published: boolean;
  children: React.ReactNode;
};

const navGroups = [
  {
    label: "Course",
    items: [
      { label: "Dashboard", href: "", icon: LayoutDashboard },
      { label: "Course info", href: "edit", icon: FileText },
      { label: "Content", href: "content", icon: BookOpen },
      { label: "Assignments", href: "assignments", icon: ClipboardList },
      { label: "Notifications", href: "notifications", icon: Bell },
    ],
  },
  {
    label: "Growth",
    items: [
      { label: "Students", href: "students", icon: GraduationCap },
      { label: "Payments", href: "payments", icon: CreditCard },
      { label: "Access programs", href: "access", icon: Gift },
      { label: "Analytics", href: "analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Course agents", href: "agents", icon: Bot },
      { label: "Collaborators", href: "collaborators", icon: Users },
    ],
  },
];

export function CourseDashboardShell({
  slug,
  title,
  published,
  children,
}: CourseDashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const basePath = `/educator/courses/${slug}`;

  return (
    <div className="min-h-screen bg-slate-50 pt-16">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <Link href="/educator" className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Educator console
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-slate-950 sm:text-2xl">
                {title}
              </h1>
              <span className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-500">
                {published ? "Published" : "Draft"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
            aria-label="Toggle course navigation"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[auto_1fr]">
        <aside
          className={cn(
            "border-b border-slate-200 bg-white lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r",
            mobileOpen ? "block" : "hidden lg:block",
            collapsed ? "lg:w-[76px]" : "lg:w-72"
          )}
        >
          <div className="flex min-h-full flex-col p-3">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="mb-3 hidden h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 lg:flex"
              aria-label={collapsed ? "Expand course navigation" : "Collapse course navigation"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {!collapsed && <span>Collapse</span>}
            </button>

            <nav className="space-y-5">
              {navGroups.map((group) => (
                <div key={group.label}>
                  {!collapsed && (
                    <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {group.label}
                    </p>
                  )}
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const href = item.href ? `${basePath}/${item.href}` : basePath;
                      const active =
                        item.href === ""
                          ? pathname === basePath
                          : pathname === href || pathname.startsWith(`${href}/`);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href || "dashboard"}
                          href={href}
                          title={collapsed ? item.label : undefined}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-bold transition-colors",
                            active
                              ? "bg-slate-950 text-white"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                            collapsed && "justify-center px-0"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
