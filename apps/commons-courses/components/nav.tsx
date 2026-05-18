"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Nav() {
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const educatorLabel = "Educator console";
  const userName = session?.user?.name || session?.user?.email || "Account";
  const userInitial = userName.slice(0, 1).toUpperCase();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  return (
    <nav
      className={cn(
        "fixed top-0 inset-x-0 z-50 border-b border-slate-200 transition-all duration-300",
        scrolled
          ? "bg-white/95 backdrop-blur shadow-sm"
          : "bg-white"
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center bg-slate-950"
          >
            <FlaskConical className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900 tracking-tight">
            CommonLab
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-7">
          <Link
            href="/courses"
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            Courses
          </Link>
          <Link
            href="/educator"
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            {educatorLabel}
          </Link>
          {session && (
            <Link
              href="/dashboard"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Dashboard
            </Link>
          )}
        </div>

        {/* Auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-950 text-sm font-bold text-white transition-colors hover:border-slate-300"
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
              >
                {session.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  userInitial
                )}
              </button>
              {profileOpen ? (
                <div className="absolute right-0 mt-3 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {userName}
                    </p>
                    {session.user?.email ? (
                      <p className="truncate text-xs text-slate-500">
                        {session.user.email}
                      </p>
                    ) : null}
                  </div>
                  <ProfileMenuLink href="/dashboard" onClick={() => setProfileOpen(false)}>
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </ProfileMenuLink>
                  <ProfileMenuLink href="/account" onClick={() => setProfileOpen(false)}>
                    <Settings className="h-4 w-4" />
                    Account settings
                  </ProfileMenuLink>
                  <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Start learning
              </Link>
              <Link
                href="/educator"
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Educator console
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-4 sm:px-6 flex flex-col gap-4">
          <Link
            href="/courses"
            className="text-sm text-slate-700"
            onClick={() => setMobileOpen(false)}
          >
            Courses
          </Link>
          <Link
            href="/educator"
            className="text-sm text-slate-700"
            onClick={() => setMobileOpen(false)}
          >
            {educatorLabel}
          </Link>
          {session && (
            <Link
              href="/dashboard"
              className="text-sm text-slate-700"
              onClick={() => setMobileOpen(false)}
            >
              Dashboard
            </Link>
          )}
          {session ? (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-sm font-bold text-white">
                  {session.user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    userInitial
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {userName}
                  </p>
                  {session.user?.email ? (
                    <p className="truncate text-xs text-slate-500">
                      {session.user.email}
                    </p>
                  ) : null}
                </div>
              </div>
              <Link
                href="/account"
                className="text-sm text-slate-700"
                onClick={() => setMobileOpen(false)}
              >
                Account
              </Link>
              <button
                onClick={() => signOut()}
                className="text-sm text-slate-700 text-left"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="text-sm text-slate-700"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="text-sm font-bold text-slate-900"
                onClick={() => setMobileOpen(false)}
              >
                Start learning
              </Link>
              <Link
                href="/educator"
                className="text-sm font-bold text-slate-900"
                onClick={() => setMobileOpen(false)}
              >
                Educator console
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

function ProfileMenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 transition-colors hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
