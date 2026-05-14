"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { FlaskConical, Menu, X } from "lucide-react";
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
        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/courses"
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            Courses
          </Link>
          <Link
            href="/#sandboxes"
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            Sandboxes
          </Link>
          <Link
            href="/#educators"
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            For educators
          </Link>
          {session && (
            <Link
              href="/dashboard"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Dashboard
            </Link>
          )}
          {session?.user?.role && ["educator", "admin"].includes(session.user.role) && (
            <Link
              href="/educator"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Educator
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
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Start learning
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
            href="/#sandboxes"
            className="text-sm text-slate-700"
            onClick={() => setMobileOpen(false)}
          >
            Sandboxes
          </Link>
          <Link
            href="/#educators"
            className="text-sm text-slate-700"
            onClick={() => setMobileOpen(false)}
          >
            For educators
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
          {session?.user?.role && ["educator", "admin"].includes(session.user.role) && (
            <Link
              href="/educator"
              className="text-sm text-slate-700"
              onClick={() => setMobileOpen(false)}
            >
              Educator
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
                Start learning
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
