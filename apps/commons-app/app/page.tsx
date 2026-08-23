import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { FeatureCarousel } from "@/components/landing/feature-carousel";
import { LandingSidebar } from "@/components/landing/landing-sidebar";

const GITHUB_URL = "https://github.com/Arttribute/agent-commons";
const DOCS_URL = "https://docs.agentcommons.io/docs";
const START_URL = "/login?callbackUrl=/studio/agents";

/**
 * The signed-out front door. It is the studio shell — same sidebar, same page
 * canvas — with a slow feature carousel where the studio's working view would
 * be, so the first thing a visitor sees is the product they are signing into.
 *
 * Signed-in visitors never reach this page: middleware routes `/` straight to
 * /studio/agents at the edge.
 */
export default function Home() {
  return (
    <div className="h-screen overflow-hidden bg-page">
      <div className="flex h-screen">
        <LandingSidebar />

        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between gap-4 px-5 pt-5 sm:px-6">
            <Link
              href="/"
              className="flex items-center md:hidden"
              aria-label="Agent Commons"
            >
              <Image
                src="/logo.jpg"
                alt="Agent Commons"
                width={131}
                height={60}
                priority
                className="h-7 w-auto rounded-md object-contain"
              />
            </Link>
            <div className="hidden md:block" />

            <nav className="flex items-center gap-1 sm:gap-2">
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-2.5 py-1.5 text-sm text-stone-600 transition-colors hover:bg-muted hover:text-stone-950 sm:px-3"
              >
                Docs
              </a>
              <Link
                href="/plans"
                className="rounded-md px-2.5 py-1.5 text-sm text-stone-600 transition-colors hover:bg-muted hover:text-stone-950 sm:px-3"
              >
                Pricing
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="flex h-8 w-8 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-muted hover:text-stone-950"
              >
                <Github className="h-4 w-4" />
              </a>
              <Link
                href="/login"
                className="ml-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-stone-900 transition-colors hover:bg-muted sm:px-3"
              >
                Log in
              </Link>
            </nav>
          </header>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-4 sm:px-8 sm:py-6">
            <h1 className="shrink-0 text-center text-[1.75rem] font-medium leading-[1.1] tracking-[-0.04em] text-stone-950 sm:text-[2.1rem]">
              One home for all your{" "}
              <span className="inline-block rounded-md border border-teal-300/70 bg-teal-200 px-[0.18em] leading-[1.15] text-stone-950">
                agents
              </span>
              .
            </h1>

            {/* Capped so a tall or narrow viewport centers the whole block
                instead of stretching the stage around a small visual. */}
            <div className="mt-4 flex max-h-[500px] min-h-0 w-full max-w-4xl flex-1 flex-col sm:mt-6 sm:max-h-[620px]">
              <FeatureCarousel />
            </div>

            <div className="mt-5 flex shrink-0 flex-col items-center gap-3 sm:mt-7">
              <Link
                href={START_URL}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-neutral-900 px-7 text-sm font-medium text-white shadow-card transition-all hover:-translate-y-0.5 hover:bg-neutral-800"
              >
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-xs text-stone-400">
                Already have an account?{" "}
                <Link
                  href={START_URL}
                  className="font-medium text-stone-600 underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
