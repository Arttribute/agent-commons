import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Layers, Play, Wifi } from "lucide-react";
import { Nav } from "@/components/nav";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";

interface CourseData {
  title: string;
  slug: string;
  tagline: string;
  price: number;
  isFree: boolean;
  courseType: "self-paced" | "live";
  level: string;
  description: string;
  lessonsCount: number;
  modulesCount: number;
  duration: string;
  tags: string[];
  nextSessionDate?: string | null;
  modules: { title: string; lessons: { title: string }[] }[];
}

interface LandingData {
  mainFeatured: CourseData | null;
  featured: CourseData[];
}

async function getLandingData(): Promise<LandingData> {
  try {
    await connectDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const courses: any[] = await Course.find({ published: true })
      .sort({ isMainFeatured: -1, isFeatured: -1, createdAt: 1 })
      .select(
        "title slug tagline price isFree courseType level description lessonsCount modulesCount duration tags nextSessionDate modules isMainFeatured isFeatured",
      )
      .lean();

    const toData = (c: any): CourseData => ({
      title: c.title as string,
      slug: c.slug as string,
      tagline: c.tagline as string,
      price: c.price as number,
      isFree: c.isFree as boolean,
      courseType: (c.courseType as "self-paced" | "live") ?? "self-paced",
      level: c.level as string,
      description: c.description as string,
      lessonsCount: c.lessonsCount as number,
      modulesCount: c.modulesCount as number,
      duration: c.duration as string,
      tags: (c.tags as string[]) ?? [],
      nextSessionDate: c.nextSessionDate
        ? new Date(c.nextSessionDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : null,
      modules: (c.modules as any[]).map((m: any) => ({
        title: m.title as string,
        lessons: (m.lessons as any[]).map((l: any) => ({
          title: l.title as string,
        })),
      })),
    });

    const mainFeatured =
      courses.find((c) => c.isMainFeatured) ?? courses[0] ?? null;
    const featured = courses
      .filter((c) => c.isFeatured && c.slug !== mainFeatured?.slug)
      .slice(0, 3);

    return {
      mainFeatured: mainFeatured ? toData(mainFeatured) : null,
      featured: featured.map(toData),
    };
  } catch {
    return { mainFeatured: null, featured: [] };
  }
}

const FALLBACK: CourseData = {
  title: "Fundamentals of AI Agents",
  slug: "fundamentals-of-ai-agents",
  tagline: "Build intelligent, autonomous agents from the ground up.",
  description:
    "A comprehensive introduction to AI agents — what they are, how they work, and how to build them. Covers the full stack: LLMs, tools, MCP, agent frameworks, security, and agentic commerce.",
  price: 99,
  isFree: false,
  courseType: "self-paced",
  level: "beginner",
  lessonsCount: 28,
  modulesCount: 6,
  duration: "8 hours",
  tags: ["AI Agents", "LLMs", "MCP", "LangGraph", "Security"],
  modules: [
    { title: "What Are AI Agents?", lessons: Array(4).fill({ title: "" }) },
    { title: "Core Building Blocks", lessons: Array(5).fill({ title: "" }) },
    {
      title: "Setting Up Your First Agent",
      lessons: Array(4).fill({ title: "" }),
    },
    { title: "Agent Frameworks", lessons: Array(4).fill({ title: "" }) },
    { title: "Security and Trust", lessons: Array(4).fill({ title: "" }) },
    {
      title: "Agentic Ecosystems and Commerce",
      lessons: Array(4).fill({ title: "" }),
    },
  ],
};

function CourseTypeBadge({ type }: { type: "self-paced" | "live" }) {
  if (type === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
        <Wifi className="h-2.5 w-2.5" /> Live class
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
      <Play className="h-2.5 w-2.5" /> Self-paced
    </span>
  );
}

export default async function HomePage() {
  const { mainFeatured: mainFeaturedRaw, featured } = await getLandingData();
  const hero = mainFeaturedRaw ?? FALLBACK;

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      <Nav />

      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section className="pt-28 pb-20 px-6 lg:px-12 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_420px] gap-16 items-start">
          {/* Left — editorial headline */}
          <div className="pt-4">
            <p className="text-xs tracking-[0.25em] uppercase text-slate-400 mb-8">
              Agent Commons — Courses
            </p>

            <h1 className="font-bold leading-[0.88] tracking-tight text-slate-900 mb-8">
              <span className="block text-6xl lg:text-8xl">Learn </span>

              <span className="block text-6xl lg:text-8xl">AI agents.</span>
            </h1>

            <p className="text-base text-slate-500 leading-relaxed max-w-md mb-10">
              Structured courses on the full agentic stack — from fundamentals
              to production-grade multi-agent systems. Built by the team behind
              Agent Commons.
            </p>

            <div className="flex flex-wrap gap-3 mb-14">
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#0a0a0a" }}
              >
                Browse courses <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Sign up free
              </Link>
            </div>

            {/* Divider + social proof row */}
            <div className="border-t border-slate-100 pt-8 flex flex-wrap gap-10">
              {[
                { value: "6", label: "Modules" },
                { value: "28", label: "Lessons" },
                { value: "8h", label: "On-demand video" },
                { value: "2", label: "Free preview lessons" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p className="text-2xl font-bold text-slate-900">{value}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-widest mt-0.5">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — featured course card */}
          <div className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-xl shadow-slate-100">
              {/* Card header */}
              <div className="bg-slate-50 border-b border-slate-100 px-6 pt-7 pb-6">
                <div className="flex items-center justify-between mb-4">
                  <CourseTypeBadge type={hero.courseType} />
                  <span className="text-2xl font-bold text-slate-900">
                    {hero.isFree ? "Free" : `$${hero.price}`}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 leading-snug mb-2">
                  {hero.title}
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {hero.tagline}
                </p>

                {/* Stats row */}
                <div className="flex gap-5 mt-5 pt-5 border-t border-slate-200 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3 w-3" />
                    {hero.modulesCount} modules
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-3 w-3" />
                    {hero.lessonsCount} lessons
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    {hero.duration}
                  </span>
                </div>
              </div>

              {/* Module list */}
              <div className="divide-y divide-slate-100">
                {hero.modules.map((m, i) => (
                  <div
                    key={m.title}
                    className="flex items-center gap-3 px-6 py-3.5"
                  >
                    <span
                      className="text-[10px] font-bold tabular-nums w-5 flex-shrink-0 text-slate-400"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm text-slate-700 flex-1 leading-snug">
                      {m.title}
                    </span>
                    <span className="text-xs text-slate-400">
                      {m.lessons.length}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="px-6 py-5 border-t border-slate-100 bg-slate-50">
                <Link
                  href={`/courses/${hero.slug}`}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "#0a0a0a" }}
                >
                  View course <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <p className="text-center text-xs text-slate-400 mt-3">
                  First 2 lessons free · No payment needed to preview
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── What you will learn ──────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-14 gap-4">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-slate-400 mb-4">
                Curriculum
              </p>
              <h2 className="text-3xl lg:text-5xl font-bold leading-tight">
                The{" "}
                <span className="relative inline-block">
                  <span
                    className="absolute -inset-x-2 inset-y-0.5 rounded-lg -z-10"
                    style={{
                      background: "linear-gradient(120deg, #86EFAC, #22D3EE)",
                    }}
                  />
                  full stack,
                </span>
                <br className="hidden lg:block" /> start to finish.
              </h2>
            </div>
            <Link
              href="/courses"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900 hover:underline"
            >
              All courses <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100 rounded-2xl overflow-hidden border border-slate-100">
            {[
              {
                num: "01",
                title: "Foundations",
                desc: "LLMs, tools, MCP, the perceive-reason-act loop. What makes a system an agent and why it matters.",
                pill: "linear-gradient(120deg, #FFE566, #FFAEC4)",
              },
              {
                num: "02",
                title: "Build",
                desc: "Working agents with Claude API, LangGraph, and the Claude Agent SDK. Real TypeScript you can run.",
                pill: "linear-gradient(120deg, #C084FC, #818CF8)",
              },
              {
                num: "03",
                title: "Security",
                desc: "Prompt injection, trust protocols, sandboxing, and least-privilege agent design.",
                pill: "linear-gradient(120deg, #FFAEC4, #C084FC)",
              },
              {
                num: "04",
                title: "Agentic Economy",
                desc: "Multi-agent coordination, agentic commerce, and USDC payments on Base.",
                pill: "linear-gradient(120deg, #86EFAC, #22D3EE)",
              },
            ].map(({ num, title, desc, pill }) => (
              <div key={num} className="bg-white p-8 flex flex-col gap-5">
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full self-start tabular-nums tracking-widest"
                  style={{ background: pill }}
                >
                  {num}
                </span>
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Featured courses (if any beyond main) ────────────────── */}
      {featured.length > 0 && (
        <section className="py-20 px-6 lg:px-12 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto">
            <p className="text-xs tracking-[0.2em] uppercase text-slate-400 mb-10">
              More courses
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((c) => (
                <Link
                  key={c.slug}
                  href={`/courses/${c.slug}`}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group"
                >
                  <div className="px-6 pt-6 pb-5">
                    <div className="flex items-center justify-between mb-4">
                      <CourseTypeBadge type={c.courseType} />
                      <span className="text-sm font-bold text-slate-900">
                        {c.isFree ? "Free" : `$${c.price}`}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug mb-2 group-hover:underline transition-colors">
                      {c.title}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                      {c.tagline}
                    </p>
                  </div>
                  <div className="px-6 py-3 border-t border-slate-100 flex gap-5 text-xs text-slate-400">
                    <span>{c.modulesCount} modules</span>
                    <span>{c.lessonsCount} lessons</span>
                    <span>{c.duration}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Free previews callout ────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-12 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-slate-400 mb-4">
              Try before you buy
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold leading-tight">
              Two lessons{" "}
              <span className="relative inline-block">
                <span
                  className="absolute -inset-x-2 inset-y-0.5 rounded-lg -z-10"
                  style={{
                    background: "linear-gradient(120deg, #FFE566, #FFAEC4)",
                  }}
                />
                free
              </span>
              <br />
              on every course.
            </h2>
          </div>
          <div>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">
              Create a free account and preview the first two lessons of any
              course before committing. No payment required — just sign up and
              start learning.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Get started free <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────── */}
      <section className="py-36 px-6 lg:px-12 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs tracking-[0.2em] uppercase text-slate-400 mb-8">
            Get started
          </p>
          <h2 className="text-5xl lg:text-7xl font-bold text-slate-900 leading-[0.92] tracking-tight mb-12">
            Start{" "}
            <span className="relative inline-block">
              <span
                className="absolute -inset-x-3 inset-y-1 rounded-xl -z-10"
                style={{
                  background:
                    "linear-gradient(120deg, #86EFAC, #34D399, #22D3EE)",
                }}
              />
              building
            </span>
            <br />
            agents today.
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 bg-slate-900"
            >
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/courses"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Browse courses
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <footer className="bg-white px-6 lg:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 border-t border-slate-200">
        <div className="flex items-center gap-2.5">
          <div
            className="h-6 w-6 rounded bg-slate-900 flex items-center justify-center"
          >
            <BookOpen className="h-3 w-3 text-white" />
          </div>
          <span>© 2026 Agent Commons</span>
        </div>
        <div className="flex gap-6">
          <Link
            href="/courses"
            className="hover:text-slate-700 transition-colors"
          >
            Courses
          </Link>
          <a
            href="https://agentcommons.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-700 transition-colors"
          >
            Agent Commons
          </a>
          <Link
            href="/auth/signin"
            className="hover:text-slate-300 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
