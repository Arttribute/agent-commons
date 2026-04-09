"use client";

import { use, useCallback, useEffect, useState } from "react";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { coursesData } from "@/data/courses";
import { Nav } from "@/components/nav";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Circle,
  Lock,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function LearnPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const course = coursesData.find((c) => c.slug === slug);
  if (!course) notFound();

  // Parse m=moduleIndex&l=lessonIndex from URL (default to 0:0)
  const moduleIdx = parseInt(searchParams.get("m") ?? "0", 10);
  const lessonIdx = parseInt(searchParams.get("l") ?? "0", 10);

  const currentModule = course.modules[moduleIdx];
  const currentLesson = currentModule?.lessons[lessonIdx];

  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [marking, setMarking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const lessonKey = `${moduleIdx}:${lessonIdx}`;
  const isCompleted = completedLessons.includes(lessonKey);

  // Fetch enrollment + progress
  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/progress?courseSlug=${slug}`);
      if (!res.ok) { setEnrolled(false); return; }
      const data = await res.json();
      setEnrolled(data.enrolled);
      setCompletedLessons(data.completedLessons ?? []);
    } catch {
      setEnrolled(false);
    }
  }, [slug]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  // Navigate to a specific lesson
  const navigate = (mi: number, li: number) => {
    router.push(`/courses/${slug}/learn?m=${mi}&l=${li}`);
    setSidebarOpen(false);
  };

  // Next / previous lesson helpers
  const allLessons = course.modules.flatMap((mod, mi) =>
    mod.lessons.map((les, li) => ({ mi, li, lesson: les })),
  );
  const currentFlatIdx = allLessons.findIndex(
    (x) => x.mi === moduleIdx && x.li === lessonIdx,
  );
  const prevLesson = currentFlatIdx > 0 ? allLessons[currentFlatIdx - 1] : null;
  const nextLesson =
    currentFlatIdx < allLessons.length - 1 ? allLessons[currentFlatIdx + 1] : null;

  // Mark current lesson as complete
  const markComplete = async () => {
    if (isCompleted || marking) return;
    setMarking(true);
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug: slug, lessonKey }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompletedLessons(data.completedLessons ?? []);
      }
    } finally {
      setMarking(false);
    }
  };

  // Guard: redirect to course page if not enrolled and lesson is not free
  if (enrolled === false && !currentLesson?.isFree) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="pt-32 flex flex-col items-center justify-center text-center px-6">
          <Lock className="h-10 w-10 text-slate-300 mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Enrol to access this lesson</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-xs">
            This lesson is part of a paid course. Enrol to unlock all content.
          </p>
          <Link
            href={`/courses/${slug}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-opacity"
          >
            View course
          </Link>
        </div>
      </div>
    );
  }

  const totalLessons = allLessons.length;
  const progressPct =
    totalLessons > 0 ? Math.round((completedLessons.length / totalLessons) * 100) : 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />

      <div className="flex flex-1 pt-16">
        {/* ── Sidebar ── */}
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed lg:static z-50 top-0 left-0 h-full w-72 bg-white border-r border-slate-100 flex flex-col transition-transform duration-200 pt-16 lg:pt-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          {/* Sidebar header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <Link
                href={`/courses/${slug}`}
                className="text-[10px] tracking-widest uppercase text-slate-400 hover:text-slate-700 transition-colors"
              >
                ← Course
              </Link>
              <h2 className="text-sm font-bold text-slate-900 mt-0.5 leading-snug line-clamp-2">
                {course.title}
              </h2>
            </div>
            <button
              className="lg:hidden p-1 rounded text-slate-400 hover:text-slate-700"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>Progress</span>
              <span className="font-semibold">{progressPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-slate-900 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Module + lesson list */}
          <div className="flex-1 overflow-y-auto py-2">
            {course.modules.map((mod, mi) => (
              <div key={mi} className="mb-1">
                <div className="px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-slate-400">
                  Module {mi + 1} · {mod.title}
                </div>
                {mod.lessons.map((les, li) => {
                  const key = `${mi}:${li}`;
                  const done = completedLessons.includes(key);
                  const active = mi === moduleIdx && li === lessonIdx;
                  const accessible = les.isFree || enrolled;

                  return (
                    <button
                      key={li}
                      disabled={!accessible}
                      onClick={() => accessible && navigate(mi, li)}
                      className={cn(
                        "w-full flex items-start gap-2.5 px-4 py-2.5 text-left transition-colors",
                        active
                          ? "bg-slate-900 text-white"
                          : accessible
                          ? "hover:bg-slate-50 text-slate-700"
                          : "opacity-40 cursor-not-allowed text-slate-400",
                      )}
                    >
                      <span className="mt-0.5 flex-shrink-0">
                        {!accessible ? (
                          <Lock className="h-3.5 w-3.5" />
                        ) : done ? (
                          <CheckCircle className={cn("h-3.5 w-3.5", active ? "text-white" : "text-green-500")} />
                        ) : (
                          <Circle className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className={cn("text-xs font-medium leading-snug", active ? "text-white" : "")}>
                          {les.title}
                        </p>
                        <p className={cn("text-[10px] mt-0.5", active ? "text-white/60" : "text-slate-400")}>
                          {les.duration}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white sticky top-16 z-10">
            <button
              className="lg:hidden p-1.5 rounded text-slate-500 hover:bg-slate-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest truncate">
                Module {moduleIdx + 1} · Lesson {lessonIdx + 1}
              </p>
              <h1 className="text-sm font-bold text-slate-900 truncate">
                {currentLesson?.title}
              </h1>
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">{currentLesson?.duration}</span>
          </div>

          {/* Lesson body */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-10">
              {/* Module / lesson header */}
              <div className="mb-8">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                  {currentModule?.title}
                </p>
                <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                  {currentLesson?.title}
                </h2>
                {currentLesson?.duration && (
                  <p className="text-sm text-slate-400 mt-1">{currentLesson.duration}</p>
                )}
              </div>

              {/* Video placeholder */}
              <div className="aspect-video rounded-2xl bg-slate-100 flex flex-col items-center justify-center mb-8 text-center px-6 border border-slate-200">
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                  <svg className="h-5 w-5 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-600">Video coming soon</p>
                <p className="text-xs text-slate-400 mt-1">
                  Read the lesson summary below while we finish recording.
                </p>
              </div>

              {/* Lesson description / summary */}
              {currentLesson?.description && (
                <div className="prose prose-sm max-w-none">
                  <h3 className="text-base font-bold text-slate-900 mb-3">Lesson Summary</h3>
                  <p className="text-slate-600 leading-relaxed">{currentLesson.description}</p>
                </div>
              )}

              {/* Module assignment (show on last lesson of each module) */}
              {lessonIdx === currentModule?.lessons.length - 1 &&
                (currentModule as any).assignment && (
                  <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                      Module Assignment
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {(currentModule as any).assignment}
                    </p>
                  </div>
                )}

              {/* Mark complete + navigation */}
              <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={markComplete}
                  disabled={isCompleted || marking || enrolled === false}
                  className={cn(
                    "flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all",
                    isCompleted
                      ? "bg-green-100 text-green-700 cursor-default"
                      : "bg-slate-900 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                >
                  {isCompleted ? (
                    <>
                      <CheckCircle className="h-4 w-4" /> Completed
                    </>
                  ) : marking ? (
                    "Saving…"
                  ) : (
                    "Mark as complete"
                  )}
                </button>

                <div className="flex gap-2 sm:ml-auto">
                  {prevLesson && (
                    <button
                      onClick={() => navigate(prevLesson.mi, prevLesson.li)}
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </button>
                  )}
                  {nextLesson && (
                    <button
                      onClick={() => navigate(nextLesson.mi, nextLesson.li)}
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                  {!nextLesson && (
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-green-600 text-white text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                      Finish course <CheckCircle className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
