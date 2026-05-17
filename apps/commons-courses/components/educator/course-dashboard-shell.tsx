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
    <div className="h-dvh overflow-hidden bg-white pt-16">
      <div className="flex h-[calc(100dvh-4rem)] min-h-0">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 flex h-dvh w-72 flex-col border-r border-slate-200 bg-white pt-16 transition-transform duration-200 lg:static lg:z-auto lg:h-full lg:pt-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            collapsed ? "lg:w-[76px]" : "lg:w-72"
          )}
        >
          <div className="flex border-b border-slate-100 p-3">
            <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
              <Link
                href="/educator"
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 transition-colors hover:text-slate-700"
              >
                Educator console
              </Link>
              <h2 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-slate-950">
                {title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-md border border-[#A6E45E] bg-[#B8F56D] px-2 py-0.5 text-[11px] font-bold text-slate-950">
                  {published ? "Published" : "Draft"}
                </span>
                <Link
                  href={`/courses/${slug}`}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-950"
                >
                  Public page
                </Link>
              </div>
            </div>
            {collapsed && (
              <Link
                href={basePath}
                title={`${title} · ${published ? "Published" : "Draft"}`}
                className="hidden h-10 w-10 items-center justify-center rounded-lg border border-[#A6E45E] bg-[#B8F56D] text-slate-950 lg:flex"
              >
                <BookOpen className="h-4 w-4" />
              </Link>
            )}
            <button
              className="ml-2 rounded p-1 text-slate-400 hover:text-slate-700 lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close course navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="mb-3 hidden h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-[#FFE177]/30 lg:flex"
              aria-label={collapsed ? "Expand course navigation" : "Collapse course navigation"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {!collapsed && <span>Collapse</span>}
            </button>

            <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain">
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
                              ? "bg-slate-950 text-white shadow-sm"
                              : "text-slate-600 hover:bg-[#71E0E7]/20 hover:text-slate-950",
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

        <main className="flex min-w-0 flex-1 flex-col bg-slate-50">
          <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"
              aria-label="Open course navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Course dashboard
              </p>
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-bold text-slate-950">{title}</h1>
                <span className="shrink-0 rounded-md border border-[#A6E45E] bg-[#B8F56D] px-2 py-0.5 text-[10px] font-bold text-slate-950">
                  {published ? "Published" : "Draft"}
                </span>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
