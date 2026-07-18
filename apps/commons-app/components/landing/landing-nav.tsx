"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { href: "#computers", label: "Computers" },
  { href: "#teams", label: "Teams" },
  { href: "#workflows", label: "Workflows" },
  { href: "#integrations", label: "Integrations" },
  { href: "#developers", label: "Developers" },
];

export function LandingNav() {
  const { authState } = useAuth();
  const signedIn = Boolean(authState.walletAddress);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.jpg"
            alt="Agent Commons"
            width={92}
            height={40}
            className="h-8 w-auto"
            priority
          />
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-stone-600 transition-colors hover:text-stone-900"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          {signedIn ? (
            <Link
              href="/studio"
              className="flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-1.5 text-sm text-white transition-colors hover:bg-stone-700"
            >
              Open studio
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-1.5 text-sm text-stone-600 transition-colors hover:text-stone-900"
              >
                Log in
              </Link>
              <Link
                href="/login?callbackUrl=/studio"
                className="rounded-full bg-stone-900 px-4 py-1.5 text-sm text-white transition-colors hover:bg-stone-700"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
