"use client";

import { use, useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { AssignmentSubmissions } from "@/components/courses/assignment-submissions";
import { AnalyticsTracker, useAnalytics } from "@/components/analytics/analytics-tracker";
import { CourseAgentDrawer } from "@/components/course-agents/course-agent-drawer";
import { LearningStudio } from "@/components/learning/learning-studio";
import { StageMedia, StudyShell } from "@/components/learning/study-shell";
import { LearnerLabWorkspace } from "@/components/labs/learner-lab-workspace";
import { RichTextRenderer } from "@/components/rich-text-renderer";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Circle,
  FlaskConical,
  Image as ImageIcon,
  Lock,
  Menu,
  Presentation,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCourseThemeStyle, type CourseTheme } from "@/lib/course-theme";
import type { CourseAgentConfig } from "@/types/course-agent";

interface Props {
  params: Promise<{ slug: string }>;
}

interface LessonData {
  title: string;
  duration: string;
  description?: string;
  assetUrl?: string;
  assetAlt?: string;
  labWorkspaceId?: string;
  isFree: boolean;
}

interface ModuleData {
  title: string;
  description?: string;
  assignment?: string;
  lessons: LessonData[];
}

interface CourseLearnData {
  title: string;
  slug: string;
  currency?: string;
  paymentProviders?: ("stripe" | "paystack")[];
  startDate?: string | Date | null;
  startDateLabel?: string | null;
  hasStarted?: boolean;
  modules: ModuleData[];
  agents?: CourseAgentConfig[];
  theme?: CourseTheme;
}

export default function LearnPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [course, setCourse] = useState<CourseLearnData | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [courseMissing, setCourseMissing] = useState(false);

  // Parse m=moduleIndex&l=lessonIndex from URL (default to 0:0)
  const moduleIdx = parseInt(searchParams.get("m") ?? "0", 10);
  const lessonIdx = parseInt(searchParams.get("l") ?? "0", 10);

  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [accessLevel, setAccessLevel] = useState<"full" | "partial">("full");
  const [paymentStatus, setPaymentStatus] = useState<
    "free" | "paid" | "partial" | "overdue"
  >("free");
  const [currentInstallment, setCurrentInstallment] = useState(0);
  const [paymentGraceEndsAt, setPaymentGraceEndsAt] = useState<string | null>(
    null
  );
  const [hasStarted, setHasStarted] = useState(true);
  const [startDateLabel, setStartDateLabel] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contentTab, setContentTab] = useState<"lesson" | "assignment">("lesson");
  const track = useAnalytics();

  const lessonKey = `${moduleIdx}:${lessonIdx}`;
  const isCompleted = completedLessons.includes(lessonKey);
  const currentModule = course?.modules[moduleIdx];
  const currentLesson = currentModule?.lessons[lessonIdx];

  useEffect(() => {
    let cancelled = false;
    async function fetchCourse() {
      setCourseLoading(true);
      try {
        const res = await fetch(`/api/courses/${slug}`);
        if (!res.ok) {
          if (!cancelled) setCourseMissing(true);
          return;
        }
        const data = (await res.json()) as CourseLearnData;
        if (!cancelled) {
          setCourse(data);
          setCourseMissing(false);
        }
      } catch {
        if (!cancelled) setCourseMissing(true);
      } finally {
        if (!cancelled) setCourseLoading(false);
      }
    }
    fetchCourse();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Fetch enrollment + progress
  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/progress?courseSlug=${slug}`);
      if (!res.ok) { setEnrolled(false); return; }
      const data = await res.json();
      setEnrolled(data.enrolled);
      setAccessLevel(data.accessLevel ?? "full");
      setPaymentStatus(data.paymentStatus ?? "free");
      setCurrentInstallment(data.currentInstallment ?? 0);
      setPaymentGraceEndsAt(data.paymentGraceEndsAt ?? null);
      setHasStarted(data.hasStarted !== false);
      setStartDateLabel(data.startDateLabel ?? null);
      setCompletedLessons(data.completedLessons ?? []);
    } catch {
      setEnrolled(false);
    }
  }, [slug]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  useEffect(() => {
    if (!course || !currentLesson) return;
    track({
      eventType: "lesson_view",
      courseSlug: slug,
      page: "course.learn",
      moduleIndex: moduleIdx,
      lessonIndex: lessonIdx,
      metadata: {
        lessonTitle: currentLesson.title,
        moduleTitle: currentModule?.title,
        isFree: currentLesson.isFree,
      },
    });
  }, [course, currentLesson, currentModule?.title, lessonIdx, moduleIdx, slug, track]);

  const maxUnlockedModule =
    accessLevel === "partial" ? Math.max(currentInstallment - 1, 0) : Infinity;
  const lockedReason =
    course?.hasStarted === false || hasStarted === false
      ? "course_not_started"
      : enrolled && paymentStatus === "overdue"
      ? "installment_overdue"
      : enrolled === false && !currentLesson?.isFree
      ? "not_enrolled"
      : enrolled && accessLevel === "partial" && moduleIdx > maxUnlockedModule
        ? "installment_locked"
        : null;

  useEffect(() => {
    if (!lockedReason) return;
    track({
      eventType: "locked_lesson_view",
      courseSlug: slug,
      page: "course.learn.locked",
      moduleIndex: moduleIdx,
      lessonIndex: lessonIdx,
      metadata: { reason: lockedReason, currentInstallment },
    });
  }, [currentInstallment, lessonIdx, lockedReason, moduleIdx, slug, track]);

  if (courseLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="pt-32 px-6 text-center">
          <p className="text-sm text-slate-500">Loading course…</p>
        </div>
      </div>
    );
  }

  if (courseMissing || !course) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="pt-32 px-6 text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Course not found
          </h2>
          <Link
            href="/courses"
            className="text-sm font-semibold text-slate-700 hover:text-slate-950"
          >
            Back to courses
          </Link>
        </div>
      </div>
    );
  }

  // Navigate to a specific lesson
  const navigate = (mi: number, li: number) => {
    track({
      eventType: "lesson_navigation",
      courseSlug: slug,
      page: "course.learn",
      moduleIndex: mi,
      lessonIndex: li,
      metadata: { fromModuleIndex: moduleIdx, fromLessonIndex: lessonIdx },
    });
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
    track({
      eventType: "lesson_complete_clicked",
      courseSlug: slug,
      page: "course.learn",
      moduleIndex: moduleIdx,
      lessonIndex: lessonIdx,
    });
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

  const nextPaymentProvider = course.paymentProviders?.includes("paystack")
    ? "&provider=paystack"
    : "";

  const courseStartLabel = startDateLabel || course.startDateLabel;

  if (course.hasStarted === false || hasStarted === false) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="pt-32 flex flex-col items-center justify-center text-center px-6">
          <Lock className="h-10 w-10 text-slate-300 mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            This course has not started yet
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">
            You&apos;re enrolled, and the course space opens
            {courseStartLabel ? ` on ${courseStartLabel}` : " on the start date"}.
          </p>
          <Link
            href={`/courses/${slug}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Back to course
          </Link>
        </div>
      </div>
    );
  }

  // Guard: redirect to course page if not enrolled and lesson is not free
  if (enrolled === false && !currentLesson?.isFree) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="pt-32 flex flex-col items-center justify-center text-center px-6">
          <Lock className="h-10 w-10 text-slate-300 mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Enrol to access this lesson</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-xs">
            This lesson is part of a paid course. Enrol to unlock all content.
          </p>
          <Link
            href={`/courses/${slug}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            View course
          </Link>
        </div>
      </div>
    );
  }

  if (enrolled && paymentStatus === "overdue") {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="pt-32 flex flex-col items-center justify-center text-center px-6">
          <Lock className="h-10 w-10 text-slate-300 mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Your next installment is overdue
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-xs">
            The grace period
            {paymentGraceEndsAt ? ` ended on ${formatDate(paymentGraceEndsAt)}` : " has ended"}.
            Make your next payment to continue the course.
          </p>
          <Link
            href={`/api/payments/checkout?courseSlug=${slug}&plan=installment${nextPaymentProvider}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Make next payment
          </Link>
        </div>
      </div>
    );
  }

  if (enrolled && accessLevel === "partial" && moduleIdx > maxUnlockedModule) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="pt-32 flex flex-col items-center justify-center text-center px-6">
          <Lock className="h-10 w-10 text-slate-300 mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            This module unlocks with your next payment
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-xs">
            Your current plan unlocks the first {currentInstallment || 1} module
            {currentInstallment === 1 ? "" : "s"}. Continue with lipa mdogo
            mdogo when you are ready.
          </p>
          <Link
            href={`/api/payments/checkout?courseSlug=${slug}&plan=installment${nextPaymentProvider}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Make next payment
          </Link>
        </div>
      </div>
    );
  }

  if (!currentModule || !currentLesson) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="pt-32 px-6 text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Lesson not found
          </h2>
          <Link
            href={`/courses/${slug}`}
            className="text-sm font-semibold text-slate-700 hover:text-slate-950"
          >
            Back to course
          </Link>
        </div>
      </div>
    );
  }

  const totalLessons = allLessons.length;
  const progressPct =
    totalLessons > 0 ? Math.round((completedLessons.length / totalLessons) * 100) : 0;
  const isLastLessonOfModule = lessonIdx === currentModule.lessons.length - 1;
  const hasAssignment = Boolean(isLastLessonOfModule && currentModule.assignment);

  const lessonNav = (
    <>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <Link
          href={`/courses/${slug}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Course
        </Link>
        <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{course.title}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-stone-800 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground">{progressPct}%</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
        {course.modules.map((mod, mi) => (
          <div key={mi} className="mb-1">
            <p className="px-4 py-2 text-xs text-muted-foreground">
              {mi + 1}. {mod.title}
            </p>
            {mod.lessons.map((les, li) => {
              const key = `${mi}:${li}`;
              const done = completedLessons.includes(key);
              const active = mi === moduleIdx && li === lessonIdx;
              const accessible = hasStarted && (les.isFree || enrolled);
              return (
                <button
                  key={li}
                  disabled={!accessible}
                  onClick={() => {
                    if (!accessible) return;
                    navigate(mi, li);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors",
                    active ? "bg-accent" : accessible ? "hover:bg-muted" : "cursor-not-allowed opacity-40",
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {!accessible ? (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                    ) : done ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-stone-300" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm leading-snug", active && "font-medium")}>
                      {les.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDuration(les.duration)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );

  const stage = [];
  if (currentLesson.assetUrl) {
    stage.push({
      key: "visual",
      label: "Visual",
      icon: ImageIcon,
      node: <StageMedia src={currentLesson.assetUrl} alt={currentLesson.assetAlt} />,
    });
  }
  if (currentLesson.labWorkspaceId) {
    stage.push({
      key: "lab",
      label: "Lab",
      icon: FlaskConical,
      flush: true,
      node: (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <LearnerLabWorkspace workspaceId={currentLesson.labWorkspaceId} compact />
        </div>
      ),
    });
  }

  return (
    <div
      style={getCourseThemeStyle(course.theme) as CSSProperties}
      className="flex h-dvh flex-col overflow-hidden bg-page text-foreground"
    >
      <AnalyticsTracker
        courseSlug={slug}
        page="course.learn"
        metadata={{ moduleIndex: moduleIdx, lessonIndex: lessonIdx }}
      />
      <Nav />
      <CourseAgentDrawer
        courseSlug={slug}
        role="learner"
        agents={course.agents}
        context={{
          page: "course.learn",
          title: currentLesson?.title,
          moduleIndex: moduleIdx,
          lessonIndex: lessonIdx,
          visibleText: [
            currentModule?.title,
            currentLesson?.title,
            currentLesson?.description,
            hasAssignment ? currentModule?.assignment : "",
          ]
            .filter(Boolean)
            .join("\n"),
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col pt-16">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-white px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open lessons"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-stone-600 lg:hidden"
          >
            <Menu className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">
              {currentModule.title} · Lesson {lessonIdx + 1}
            </p>
            <h1 className="truncate text-sm font-medium">{currentLesson.title}</h1>
          </div>
          <Link
            href={`/courses/${slug}/materials`}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-stone-600 transition-colors hover:bg-muted"
          >
            <Presentation className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">Materials</span>
          </Link>
        </header>

        <StudyShell
          rail={lessonNav}
          stage={stage}
          contentLabel="Lesson"
          contentWidth={stage.length ? "wide" : "md"}
          contentHeader={
            hasAssignment ? (
              <div className="flex items-center gap-1">
                <ContentTab
                  active={contentTab === "lesson"}
                  label="Lesson"
                  onClick={() => setContentTab("lesson")}
                />
                <ContentTab
                  active={contentTab === "assignment"}
                  label="Assignment"
                  onClick={() => setContentTab("assignment")}
                />
              </div>
            ) : null
          }
          footer={
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={markComplete}
                disabled={isCompleted || marking || enrolled === false}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                  isCompleted
                    ? "cursor-default bg-emerald-50 text-emerald-700"
                    : "bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-40",
                )}
              >
                {isCompleted ? (
                  <>
                    <CheckCircle className="h-4 w-4" strokeWidth={1.75} /> Completed
                  </>
                ) : marking ? (
                  "Saving"
                ) : (
                  "Mark complete"
                )}
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => prevLesson && navigate(prevLesson.mi, prevLesson.li)}
                  disabled={!prevLesson}
                  aria-label="Previous lesson"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-stone-600 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                </button>
                {nextLesson ? (
                  <button
                    onClick={() => navigate(nextLesson.mi, nextLesson.li)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-muted"
                  >
                    Next <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                ) : (
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-muted"
                  >
                    Finish <CheckCircle className="h-4 w-4" strokeWidth={1.75} />
                  </Link>
                )}
              </div>
            </div>
          }
        >
          {contentTab === "assignment" && hasAssignment ? (
            <div>
              <RichTextRenderer value={currentModule.assignment || ""} />
              <AssignmentSubmissions
                courseSlug={slug}
                moduleIndex={moduleIdx}
                lessonIndex={lessonIdx}
                enrolled={enrolled}
              />
            </div>
          ) : (
            <>
              {currentLesson.description ? (
                <LearningStudio
                  courseSlug={slug}
                  courseTitle={course.title}
                  contentTitle={currentLesson.title}
                  source={currentLesson.description}
                >
                  <RichTextRenderer value={currentLesson.description} />
                </LearningStudio>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This lesson has no written notes. Use the lab or materials to continue.
                </p>
              )}
              {!hasAssignment ? (
                <AssignmentSubmissions
                  courseSlug={slug}
                  moduleIndex={moduleIdx}
                  lessonIndex={lessonIdx}
                  enrolled={enrolled}
                />
              ) : null}
            </>
          )}
        </StudyShell>
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-stone-950/30"
            aria-label="Close lessons"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-white shadow-floating">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-medium">Lessons</p>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close lessons"
                className="rounded-lg border border-border p-1.5 text-stone-600"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            {lessonNav}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContentTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function formatDuration(value?: string) {
  if (!value) return "";
  return /^\d+$/.test(value.trim()) ? `${value.trim()} min` : value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
