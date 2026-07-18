"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "https://docs.agentcommons.io/docs", label: "Docs", external: true },
  { href: "/plans", label: "Pricing" },
  {
    href: "https://github.com/Arttribute/agent-commons",
    label: "GitHub",
    external: true,
  },
];

export function LandingNav() {
  const { authState } = useAuth();
  const signedIn = Boolean(authState.walletAddress);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.jpg"
            alt="Agent Commons"
            width={92}
            height={40}
            className="h-9 w-auto"
            priority
          />
        </Link>
        <nav className="hidden items-center gap-8 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noreferrer" : undefined}
              className="text-[14px] font-medium text-stone-600 transition-colors hover:text-stone-950"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          {signedIn ? (
            <Link
              href="/studio/agents"
              className="flex items-center gap-1.5 rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
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
                href="/login?callbackUrl=/studio/agents"
                className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
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
