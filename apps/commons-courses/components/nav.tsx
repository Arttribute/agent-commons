"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Menu, X, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function Nav() {
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded flex items-center justify-center"
            style={{ backgroundColor: "#0a0a0a" }}
          >
            <BookOpen className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900 tracking-tight">
            Agent Commons{" "}
            <span>Courses</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/courses"
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            Courses
          </Link>
          {session && (
            <Link
              href="/dashboard"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Dashboard
            </Link>
          )}
          <a
            href="https://agentcommons.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            Agent Commons ↗
          </a>
        </div>

        {/* Auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <>
              <span className="text-sm text-slate-500">
                {session.user?.name}
              </span>
              <button
                onClick={() => signOut()}
                className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Sign out
              </button>
            </>
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
                className="text-sm px-4 py-2 rounded-lg text-white font-bold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#0a0a0a" }}
              >
                Get started
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
        <div className="md:hidden bg-white border-b border-slate-200 px-6 py-4 flex flex-col gap-4">
          <Link
            href="/courses"
            className="text-sm text-slate-700"
            onClick={() => setMobileOpen(false)}
          >
            Courses
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
          <a
            href="https://agentcommons.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-700"
          >
            Agent Commons
          </a>
          {session ? (
            <button
              onClick={() => signOut()}
              className="text-sm text-slate-700 text-left"
            >
              Sign out
            </button>
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
                Get started
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
