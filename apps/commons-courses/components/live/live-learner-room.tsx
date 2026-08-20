"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FlaskConical,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Radio,
  Save,
  Send,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { CourseAgentDrawer } from "@/components/course-agents/course-agent-drawer";
import { CourseMaterialViewer } from "@/components/course-material-viewer";
import { LearnerLabWorkspace } from "@/components/labs/learner-lab-workspace";
import { cn } from "@/lib/utils";
import { getCourseThemeStyle } from "@/lib/course-theme";
import {
  canReviseLiveResponse,
  decodeOtherResponse,
  encodeOtherResponse,
  isPrioritizationResponse,
  isWorksheetResponse,
  isValidLiveResponse,
  sameLiveResponseValue,
} from "@/lib/live-response-policy";
import {
  learnerAvailableActivities,
  resolveLearnerActivitySelection,
} from "@/lib/live-learner-selection";
import type {
  LearnerLiveSession,
  LiveActivity,
  LiveResponseRecord,
  LiveResponseValue,
} from "@/types/live-session";
import type { LiveSessionState } from "@/types/live-session";

type EnrollmentGate = {
  courseId?: string;
  courseTitle?: string;
  courseSlug?: string;
  isFree?: boolean;
  message: string;
};

export function LiveLearnerRoom({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<LearnerLiveSession | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [values, setValues] = useState<Record<string, LiveResponseValue>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [enrollmentGate, setEnrollmentGate] = useState<EnrollmentGate | null>(
    null,
  );
  const [enrolling, setEnrolling] = useState(false);
  const [workbookOpen, setWorkbookOpen] = useState(false);
  const [connection, setConnection] = useState<
    "connecting" | "synced" | "reconnecting" | "offline"
  >("connecting");
  const stateVersionRef = useRef(-1);
  const observedStateVersionRef = useRef(-1);
  const presentedActivityRef = useRef("");
  const sessionRef = useRef<LearnerLiveSession | null>(null);
  const requestRef = useRef(0);
  const lastSyncRef = useRef(0);
  const sessionStatus = session?.status;

  const applySelection = useCallback((next: LearnerLiveSession) => {
    const lastPresentedActivityId = presentedActivityRef.current;
    setSelectedId((selectedActivityId) =>
      resolveLearnerActivitySelection({
        activities: next.activities,
        currentActivityId: next.currentActivityId,
        lastPresentedActivityId,
        pace: next.pace,
        responses: next.responses,
        selectedActivityId,
      }),
    );
    presentedActivityRef.current = next.currentActivityId || "";
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      const requestId = ++requestRef.current;
      if (!quiet) setLoading(true);
      const res = await fetch(`/api/live-sessions/${sessionId}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!res) {
        if (requestId === requestRef.current)
          setConnection(navigator.onLine ? "reconnecting" : "offline");
        if (!quiet) setLoading(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (requestId !== requestRef.current) return;
      if (!res.ok) {
        if (data.code === "ENROLLMENT_REQUIRED") {
          setEnrollmentGate({
            courseId: data.course?.id,
            courseTitle: data.course?.title,
            courseSlug: data.course?.slug,
            isFree: data.course?.isFree,
            message:
              data.error || "Enroll in this course to join the live session.",
          });
          sessionRef.current = null;
          setSession(null);
          setNotice("");
        } else if (!quiet) {
          setNotice(data.error || "Could not enter this live session.");
        }
        if (!quiet) setLoading(false);
        return;
      }
      const next = data.session as LearnerLiveSession;
      if (next.stateVersion < observedStateVersionRef.current) {
        if (!quiet) setLoading(false);
        return;
      }
      setEnrollmentGate(null);
      sessionRef.current = next;
      setSession(next);
      stateVersionRef.current = next.stateVersion;
      observedStateVersionRef.current = Math.max(
        observedStateVersionRef.current,
        next.stateVersion,
      );
      lastSyncRef.current = Date.now();
      setConnection("synced");
      applySelection(next);
      setValues((current) => ({
        ...Object.fromEntries(
          Object.values(next.responses).map((response) => [
            response.activityId,
            response.value,
          ]),
        ),
        ...current,
      }));
      setNotice("");
      if (!quiet) setLoading(false);
    },
    [applySelection, sessionId],
  );

  const applyLiveState = useCallback(
    (state: LiveSessionState) => {
      observedStateVersionRef.current = Math.max(
        observedStateVersionRef.current,
        state.stateVersion,
      );
      const current = sessionRef.current;
      if (!current) return;
      const activities = current.activities.map((item) => {
        const updated =
          state.currentActivity?.id === item.id
            ? { ...item, ...state.currentActivity }
            : item;
        return {
          ...updated,
          status: state.activityStatuses[item.id] || updated.status,
        };
      });
      if (
        state.currentActivity &&
        !activities.some((item) => item.id === state.currentActivity?.id)
      ) {
        activities.push(state.currentActivity);
      }
      const next: LearnerLiveSession = {
        ...current,
        status: state.status,
        pace: state.pace,
        currentActivityId: state.currentActivityId,
        settings: {
          ...current.settings,
          learnerCopilot: state.learnerCopilot,
        },
        stateVersion: state.stateVersion,
        activities,
      };
      sessionRef.current = next;
      setSession(next);
      applySelection(next);
    },
    [applySelection],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sessionStatus || sessionStatus === "ended") return;
    let cancelled = false;
    let timer = 0;
    async function poll() {
      try {
        const res = await fetch(`/api/live-sessions/${sessionId}/state`, {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (payload.code === "ENROLLMENT_REQUIRED") {
            await load(true);
            return;
          }
          throw new Error(payload.error || "Room state unavailable");
        }
        if (cancelled) return;
        const state = payload.state as LiveSessionState;
        lastSyncRef.current = Date.now();
        setConnection("synced");
        applyLiveState(state);
        if (state.stateVersion !== stateVersionRef.current) {
          await load(true);
        }
      } catch {
        if (!cancelled)
          setConnection(navigator.onLine ? "reconnecting" : "offline");
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 1200);
      }
    }
    timer = window.setTimeout(poll, 500);
    const reconnect = () => void load(true);
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
    };
  }, [applyLiveState, load, sessionId, sessionStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lastSyncRef.current && Date.now() - lastSyncRef.current > 5000) {
        setConnection(navigator.onLine ? "reconnecting" : "offline");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!workbookOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkbookOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [workbookOpen]);

  const activity = session?.activities.find((item) => item.id === selectedId);
  const activityIndex =
    session?.activities.findIndex((item) => item.id === selectedId) ?? -1;
  const response = activity ? session?.responses[activity.id] : undefined;
  const availableActivities = useMemo(
    () =>
      session
        ? learnerAvailableActivities(
            session.activities,
            session.currentActivityId,
            session.responses,
          )
        : [],
    [session],
  );
  const activityPosition = activityIndex >= 0 ? activityIndex + 1 : null;
  const availableActivityIndex = availableActivities.findIndex(
    (item) => item.id === selectedId,
  );

  async function submit(valueOverride?: LiveResponseValue) {
    if (!activity || submitting) return;
    const value = valueOverride ?? values[activity.id];
    if ((typeof value === "string" && !value.trim()) || value === undefined)
      return;
    setSubmitting(true);
    setNotice("");
    const res = await fetch(`/api/live-sessions/${sessionId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityId: activity.id, value }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSession((current) => {
        if (!current) return current;
        const next = {
          ...current,
          responses: {
            ...current.responses,
            [activity.id]: data.response as LiveResponseRecord,
          },
        };
        sessionRef.current = next;
        return next;
      });
      if (session?.pace === "learner") goNext();
    } else setNotice(data.error || "Could not save your response.");
    setSubmitting(false);
  }

  function goNext() {
    if (!session || availableActivityIndex < 0) return;
    const next = availableActivities[availableActivityIndex + 1];
    if (next) setSelectedId(next.id);
  }

  async function enrollAndEnter() {
    if (!enrollmentGate?.courseId || enrolling) return;
    setEnrolling(true);
    setNotice("");
    const res = await fetch("/api/enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: enrollmentGate.courseId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok || res.status === 409) {
      await load();
    } else {
      setNotice(data.error || "Could not enroll in this course.");
    }
    setEnrolling(false);
  }

  if (loading) return <Centered message="Entering the live room…" />;
  if (enrollmentGate) {
    return (
      <EnrollmentRequired
        gate={enrollmentGate}
        notice={notice}
        enrolling={enrolling}
        onEnroll={enrollAndEnter}
      />
    );
  }
  if (!session)
    return (
      <Centered message={notice || "This session is unavailable."} error />
    );
  if (session.status === "lobby") {
    return (
      <main
        style={getCourseThemeStyle(session.courseTheme) as CSSProperties}
        className="flex min-h-screen items-center justify-center bg-[var(--course-primary)] px-5 py-12 text-[var(--course-on-primary)]"
      >
        <div className="w-full max-w-lg text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Radio className="h-6 w-6 text-[var(--course-accent)]" />
          </span>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-[var(--course-accent)]">
            You’re in the room
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {session.title}
          </h1>
          <p className="mt-4 text-sm leading-6 opacity-70">
            The facilitator will begin shortly. Keep this page open; your
            workbook will update automatically.
          </p>
          <div className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold">
            <Users className="h-4 w-4" />
            {session.participantCount} joined
          </div>
          <LoaderCircle className="mx-auto mt-8 h-5 w-5 animate-spin opacity-50" />
        </div>
      </main>
    );
  }

  if (session.status === "ended" && !activity)
    return (
      <Centered message="This live session has ended. Your responses are saved with your course." />
    );

  return (
    <main
      style={getCourseThemeStyle(session.courseTheme) as CSSProperties}
      className="min-h-screen bg-[var(--course-background)] text-[var(--course-text)]"
    >
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[var(--course-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-10">
          <Link
            href="/dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--course-primary)] text-[var(--course-on-primary)]"
          >
            <FlaskConical className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold sm:text-sm">
              {session.title}
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-[9px] font-medium text-slate-500 sm:text-[10px]">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  session.status === "live" ? "bg-emerald-500" : "bg-slate-300",
                )}
              />
              {session.status === "live" ? "Live" : "Not live"}
            </p>
          </div>
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline-flex",
              connection === "synced"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connection === "synced"
                  ? "bg-emerald-500"
                  : "animate-pulse bg-amber-500",
              )}
            />
            {connection === "synced"
              ? "In sync"
              : connection === "offline"
                ? "Offline"
                : "Reconnecting"}
          </span>
          <span className="hidden items-center gap-1.5 text-xs opacity-50 lg:inline-flex">
            <Users className="h-3.5 w-3.5" />
            {session.participantCount}
          </span>
          <button
            type="button"
            onClick={() => setWorkbookOpen(true)}
            aria-expanded={workbookOpen}
            aria-controls="live-workbook-drawer"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-[var(--course-surface)] px-3 text-xs font-bold shadow-sm hover:border-slate-300"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Activities</span>
            <span className="rounded bg-[var(--course-background)] px-1.5 py-0.5 text-[10px]">
              {activityPosition || "–"}/{session.activities.length}
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 opacity-50 sm:block" />
          </button>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between text-xs opacity-50 sm:mb-4">
            <span>
              {activityPosition
                ? `Activity ${activityPosition} of ${session.activities.length}`
                : "Waiting for the current activity"}
            </span>
            {activity?.estimatedMinutes ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {activity.estimatedMinutes} min
              </span>
            ) : null}
          </div>
          {activity ? (
            <LearnerActivity
              key={activity.id}
              activity={activity}
              learnerSeed={session.participant.id}
              value={values[activity.id]}
              response={response}
              submitting={submitting}
              onChange={(value) =>
                setValues((current) => ({ ...current, [activity.id]: value }))
              }
              onSubmit={submit}
            />
          ) : (
            <div className="flex min-h-[55dvh] items-center justify-center rounded-2xl border border-slate-200 bg-[var(--course-surface)] p-8 text-center">
              <div>
                <Radio className="mx-auto h-6 w-6 opacity-25" />
                <p className="mt-4 text-sm font-bold">
                  Ready for the next activity
                </p>
                <p className="mt-2 text-xs leading-5 opacity-50">
                  You are enrolled and connected. The activity will appear when
                  your facilitator presents it.
                </p>
                {connection !== "synced" ? (
                  <button
                    onClick={() => void load(true)}
                    className="mt-5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
                  >
                    Reconnect now
                  </button>
                ) : null}
              </div>
            </div>
          )}
          {notice ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {notice}
            </p>
          ) : null}
          {session.pace === "learner" && activity ? (
            <div className="mt-5 flex justify-between">
              <button
                disabled={
                  availableActivityIndex <= 0
                }
                onClick={() => {
                  setSelectedId(
                    availableActivities[availableActivityIndex - 1]?.id ||
                      activity.id,
                  );
                }}
                className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </button>
              <button
                disabled={
                  availableActivityIndex < 0 ||
                  availableActivityIndex >= availableActivities.length - 1
                }
                onClick={goNext}
                className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 disabled:opacity-30"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </section>
      </div>
      <WorkbookDrawer
        open={workbookOpen}
        session={session}
        selectedId={activity?.id}
        onClose={() => setWorkbookOpen(false)}
        onSelect={(activityId) => {
          setSelectedId(activityId);
          setWorkbookOpen(false);
        }}
      />
      {session.settings.learnerCopilot.enabled ? (
        <CourseAgentDrawer
          courseSlug={session.courseSlug}
          role="learner"
          context={{
            page: "live_session",
            liveSessionId: session.id,
            title: activity?.title || session.title,
            visibleText: [
              activity?.prompt,
              activity?.instructions,
              activity?.successCriteria,
            ]
              .filter(Boolean)
              .join("\n"),
          }}
        />
      ) : null}
    </main>
  );
}

function EnrollmentRequired({
  gate,
  notice,
  enrolling,
  onEnroll,
}: {
  gate: EnrollmentGate;
  notice: string;
  enrolling: boolean;
  onEnroll: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white sm:px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#71E0E7]/15 text-[#71E0E7]">
          <GraduationCap className="h-6 w-6" />
        </span>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-[#71E0E7]">
          Enrollment required
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          Join the course to enter this room
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{gate.message}</p>
        {gate.courseTitle ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Course
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {gate.courseTitle}
            </p>
          </div>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </p>
        ) : null}
        <div className="mt-6 space-y-3">
          {gate.isFree && gate.courseId ? (
            <button
              type="button"
              onClick={onEnroll}
              disabled={enrolling}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#B8F56D] px-5 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-[#c7fa83] disabled:opacity-60"
            >
              {enrolling ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <GraduationCap className="h-4 w-4" />
              )}
              {enrolling ? "Enrolling…" : "Enroll and join live session"}
            </button>
          ) : gate.courseSlug ? (
            <Link
              href={`/courses/${gate.courseSlug}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-bold text-slate-950"
            >
              View enrollment options <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
          <Link
            href="/join"
            className="block w-full py-2 text-center text-xs font-bold text-slate-400 hover:text-white"
          >
            Use a different session code
          </Link>
        </div>
      </div>
    </main>
  );
}

function WorkbookDrawer({
  open,
  session,
  selectedId,
  onClose,
  onSelect,
}: {
  open: boolean;
  session: LearnerLiveSession;
  selectedId?: string;
  onClose: () => void;
  onSelect: (activityId: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workbook-title"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        aria-label="Close activities"
      />
      <section
        id="live-workbook-drawer"
        className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col rounded-t-3xl border border-slate-200 bg-[var(--course-surface)] text-[var(--course-text)] shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[390px] sm:rounded-none sm:rounded-l-3xl"
      >
        <div className="flex items-start gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--course-primary)] text-[var(--course-on-primary)]">
            <BookOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="workbook-title" className="font-bold">
              Activities
            </h2>
            <p className="mt-1 text-xs opacity-55">
              {session.pace === "facilitator"
                ? "Your facilitator controls what appears next."
                : "Move through the available workbook activities."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200"
            aria-label="Close activities"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="space-y-1.5">
            {session.activities.map((item, index) => {
              const locked = item.status === "draft";
              const selected = item.id === selectedId;
              const done = Boolean(session.responses[item.id]);
              const canSelect =
                selected ||
                (session.pace === "learner" &&
                  !locked &&
                  (item.status === "open" || done));
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!canSelect}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                    selected
                      ? "border-transparent bg-[var(--course-primary)] text-[var(--course-on-primary)]"
                      : "border-transparent hover:border-slate-200 hover:bg-[var(--course-background)]",
                    !canSelect && !selected && "cursor-default opacity-45",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-current/10 text-[10px] font-bold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-5">
                      {item.title || `Activity ${index + 1}`}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide opacity-50">
                      {selected
                        ? "Showing now"
                        : done
                          ? "Completed"
                          : locked
                            ? "Upcoming"
                            : item.status === "closed"
                              ? "Closed"
                              : labelFor(item.type)}
                    </span>
                  </span>
                  {locked ? (
                    <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
                  ) : done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function LearnerActivity({
  activity,
  learnerSeed,
  value,
  response,
  submitting,
  onChange,
  onSubmit,
}: {
  activity: LiveActivity;
  learnerSeed: string;
  value?: LiveResponseValue;
  response?: LiveResponseRecord;
  submitting: boolean;
  onChange: (value: LiveResponseValue) => void;
  onSubmit: (valueOverride?: LiveResponseValue) => void;
}) {
  const isChoice = activity.options.length > 0;
  const result = activity.status === "closed" && activity.showResults;
  const canRevisePoll = canReviseLiveResponse(activity);
  const responseChanged = response
    ? !sameLiveResponseValue(value, response.value)
    : false;
  const typedOther = decodeOtherResponse(value);
  const hasValidValue = Boolean(
    value && isValidLiveResponse(activity, value),
  );
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-[var(--course-surface)]">
      <div className="p-6 sm:p-9">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[var(--course-accent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--course-on-accent)]">
            {labelFor(activity.type)}
          </span>
          {activity.required ? (
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-50">
              Required
            </span>
          ) : null}
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          {activity.title || labelFor(activity.type)}
        </h1>
        {activity.prompt ? (
          <p className="mt-4 text-lg leading-8 opacity-80">{activity.prompt}</p>
        ) : null}
        {activity.instructions ? (
          <div className="mt-6 whitespace-pre-wrap rounded-xl bg-[var(--course-background)] p-4 text-sm leading-7 opacity-80">
            {activity.instructions}
          </div>
        ) : null}
        {activity.successCriteria ? (
          <div className="mt-4 border-l-2 border-[var(--course-highlight)] pl-4">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-50">
              Done when
            </p>
            <p className="mt-1 text-sm leading-6 opacity-80">
              {activity.successCriteria}
            </p>
          </div>
        ) : null}
        {activity.resourceUrl ? (
          <a
            href={activity.resourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm font-bold underline underline-offset-4"
          >
            Open activity resource <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>
      {activity.materialId ? (
        <div className="border-t border-slate-100 p-4 sm:p-6">
          <CourseMaterialViewer
            key={activity.id}
            materialId={activity.materialId}
            initialSlide={activity.materialStartSlide}
            progressKey={activity.id}
            syncMode="off"
            compact
          />
        </div>
      ) : null}
      {activity.labWorkspaceId ? (
        <div className="border-t border-slate-100 p-4 sm:p-6">
          <LearnerLabWorkspace
            workspaceId={activity.labWorkspaceId}
            entryPath={activity.labEntryPath}
            compact
          />
        </div>
      ) : null}
      {activity.type === "worksheet" ? (
        <WorksheetResponsePanel
          activity={activity}
          value={value}
          response={response}
          submitting={submitting}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      ) : activity.type === "prioritization" ? (
        <PrioritizationResponsePanel
          activity={activity}
          value={value}
          response={response}
          submitting={submitting}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      ) : isChoice ? (
        <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-7">
          {activity.responseStyle === "scale" ? (
            <div className="mb-3 flex items-center justify-between gap-4 text-xs font-medium text-slate-500">
              <span>{scaleEndpoint(activity.options[0]?.label)}</span>
              <span className="text-right">
                {scaleEndpoint(activity.options.at(-1)?.label)}
              </span>
            </div>
          ) : null}
          <div
            className={cn(
              "grid gap-3",
              activity.responseStyle === "scale"
                ? "grid-cols-5"
                : "sm:grid-cols-2",
            )}
          >
            {orderedOptions(activity, learnerSeed).map((option) => {
              const selected =
                value === option.id ||
                (Array.isArray(value) && value.includes(option.id));
              return (
                <button
                  key={option.id}
                  disabled={
                    activity.status !== "open" ||
                    (Boolean(response) && !canRevisePoll)
                  }
                  onClick={() => onChange(option.id)}
                  className={cn(
                    "border bg-white text-sm font-bold transition",
                    activity.responseStyle === "scale"
                      ? "aspect-square min-h-12 rounded-full p-2 text-center sm:aspect-auto sm:min-h-16 sm:rounded-xl"
                      : "min-h-16 rounded-xl p-4 text-left",
                    selected
                      ? "border-slate-950 ring-1 ring-slate-950"
                      : "border-slate-200 hover:border-slate-400",
                    result &&
                      option.isCorrect &&
                      "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500",
                    response && !result && "disabled:opacity-70",
                  )}
                >
                  {activity.responseStyle === "scale"
                    ? scaleNumber(option.label)
                    : option.label}
                  {result && option.isCorrect ? (
                    <Check className="ml-2 inline h-4 w-4 text-emerald-600" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {activity.allowOther ? (
            <div
              className={cn(
                "mt-3 rounded-xl border bg-white p-4 transition",
                typedOther !== undefined
                  ? "border-slate-950 ring-1 ring-slate-950"
                  : "border-slate-200",
              )}
            >
              <button
                type="button"
                disabled={
                  activity.status !== "open" ||
                  (Boolean(response) && !canRevisePoll)
                }
                onClick={() => onChange(encodeOtherResponse(typedOther || ""))}
                className="flex w-full items-center gap-3 text-left text-sm font-bold disabled:opacity-60"
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded-full border",
                    typedOther !== undefined
                      ? "border-[5px] border-slate-950"
                      : "border-slate-300",
                  )}
                />
                Other
              </button>
              {typedOther !== undefined ? (
                <input
                  autoFocus
                  value={typedOther}
                  maxLength={500}
                  disabled={
                    activity.status !== "open" ||
                    (Boolean(response) && !canRevisePoll)
                  }
                  onChange={(event) =>
                    onChange(encodeOtherResponse(event.target.value))
                  }
                  placeholder="Type your answer…"
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-slate-500 disabled:bg-slate-100"
                />
              ) : null}
            </div>
          ) : null}
          {response && canRevisePoll ? (
            <>
              <Saved message="Response saved · You can change it while the poll is open" />
              <button
                onClick={() => onSubmit()}
                disabled={!hasValidValue || submitting || !responseChanged}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {responseChanged ? "Update response" : "Response is up to date"}
              </button>
            </>
          ) : response ? (
            <Saved />
          ) : activity.status !== "open" ? (
            <ResponsesClosed />
          ) : (
            <button
              onClick={() => onSubmit()}
              disabled={
                !hasValidValue || submitting || activity.status !== "open"
              }
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {submitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}{" "}
              Submit response
            </button>
          )}
        </div>
      ) : activity.type === "content" || activity.type === "break" ? (
        <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-7">
          {response ? (
            <Saved />
          ) : activity.status !== "open" ? (
            <ResponsesClosed />
          ) : (
            <button
              onClick={() => onSubmit("complete")}
              disabled={submitting || activity.status !== "open"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              <Check className="h-4 w-4" />{" "}
              {activity.type === "break" ? "I’m back" : "Mark as viewed"}
            </button>
          )}
        </div>
      ) : activity.status !== "open" && !response ? (
        <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-7">
          <ResponsesClosed />
        </div>
      ) : (
        <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-7">
          <textarea
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            disabled={activity.status !== "open" || Boolean(response)}
            rows={6}
            placeholder={
              activity.type === "task"
                ? "Add a short response, link, or note about your artifact…"
                : "Write your response…"
            }
            className="w-full resize-y rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 outline-none focus:border-slate-400 disabled:bg-slate-100"
          />
          {response ? (
            <Saved />
          ) : (
            <button
              onClick={() => onSubmit()}
              disabled={!value || submitting || activity.status !== "open"}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {submitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}{" "}
              Save response
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function WorksheetResponsePanel({
  activity,
  value,
  response,
  submitting,
  onChange,
  onSubmit,
}: {
  activity: LiveActivity;
  value?: LiveResponseValue;
  response?: LiveResponseRecord;
  submitting: boolean;
  onChange: (value: LiveResponseValue) => void;
  onSubmit: (valueOverride?: LiveResponseValue) => void;
}) {
  const current = isWorksheetResponse(value)
    ? value
    : { values: {}, finalized: false };
  const fields = activity.worksheetFields || [];
  const sections = fields.reduce<Array<{ title: string; fields: typeof fields }>>(
    (groups, field) => {
      const title = field.section || "Your responses";
      const existing = groups.find((group) => group.title === title);
      if (existing) existing.fields.push(field);
      else groups.push({ title, fields: [field] });
      return groups;
    },
    [],
  );
  const answered = fields.filter(
    (field) => current.values[field.id] !== undefined,
  ).length;
  const requiredComplete = fields.every(
    (field) => !field.required || current.values[field.id] !== undefined,
  );
  const canEdit = activity.status === "open";
  const changed = response
    ? !sameLiveResponseValue(current, response.value)
    : answered > 0;

  function update(fieldId: string, nextValue: string | number) {
    const values = { ...current.values };
    if (nextValue === "") delete values[fieldId];
    else values[fieldId] = nextValue;
    onChange({ values, finalized: false });
  }

  return (
    <div className="border-t border-slate-100 bg-[var(--course-background)] p-4 sm:p-7">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">Fill in your workbook</p>
            <p className="mt-1 text-xs opacity-55">
              Your progress is private to you and your facilitators.
            </p>
          </div>
          <span className="rounded-full bg-[var(--course-surface)] px-3 py-1.5 text-xs font-bold opacity-70">
            {answered}/{fields.length} answered
          </span>
        </div>
        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-slate-200 bg-[var(--course-surface)] p-4 sm:p-6"
          >
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] opacity-55">
              {section.title}
            </h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {section.fields.map((field) => {
                const fieldValue = current.values[field.id];
                return (
                  <label
                    key={field.id}
                    className={cn(
                      "block",
                      field.type === "long_text" && "md:col-span-2",
                    )}
                  >
                    <span className="text-sm font-bold leading-6">
                      {field.label}
                      {field.required ? <span className="ml-1 text-red-500">*</span> : null}
                    </span>
                    {field.description ? (
                      <span className="mt-1 block text-xs leading-5 opacity-55">
                        {field.description}
                      </span>
                    ) : null}
                    {field.type === "scale" ? (
                      <div className="mt-3">
                        <div className="grid grid-cols-5 gap-2">
                          {Array.from(
                            { length: (field.max ?? 5) - (field.min ?? 1) + 1 },
                            (_, index) => (field.min ?? 1) + index,
                          ).map((number) => (
                            <button
                              key={number}
                              type="button"
                              disabled={!canEdit}
                              onClick={() => update(field.id, number)}
                              className={cn(
                                "min-h-12 rounded-xl border text-sm font-bold transition",
                                fieldValue === number
                                  ? "border-[var(--course-primary)] bg-[var(--course-primary)] text-[var(--course-on-primary)]"
                                  : "border-slate-200 bg-white hover:border-slate-400",
                              )}
                            >
                              {number}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-between gap-4 text-[11px] opacity-50">
                          <span>{field.lowLabel}</span>
                          <span className="text-right">{field.highLabel}</span>
                        </div>
                      </div>
                    ) : field.type === "long_text" ? (
                      <textarea
                        rows={5}
                        maxLength={10_000}
                        disabled={!canEdit}
                        value={typeof fieldValue === "string" ? fieldValue : ""}
                        onChange={(event) => update(field.id, event.target.value)}
                        placeholder={field.placeholder}
                        className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-950 outline-none focus:border-slate-500 disabled:bg-slate-100"
                      />
                    ) : (
                      <input
                        type={field.type === "date" ? "date" : "text"}
                        maxLength={500}
                        disabled={!canEdit}
                        value={typeof fieldValue === "string" ? fieldValue : ""}
                        onChange={(event) => update(field.id, event.target.value)}
                        placeholder={field.placeholder}
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-slate-500 disabled:bg-slate-100"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
        {response ? (
          <Saved
            message={
              isWorksheetResponse(response.value) && response.value.finalized && !changed
                ? "Workbook section completed"
                : "Progress saved · You can keep editing while this is open"
            }
          />
        ) : null}
        {canEdit ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onSubmit({ values: current.values, finalized: false })}
              disabled={!answered || submitting || !changed}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-40"
            >
              <Save className="h-4 w-4" /> Save progress
            </button>
            <button
              type="button"
              onClick={() => onSubmit({ values: current.values, finalized: true })}
              disabled={!answered || !requiredComplete || submitting}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--course-primary)] px-4 text-sm font-bold text-[var(--course-on-primary)] disabled:opacity-40"
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Complete this section
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PrioritizationResponsePanel({
  activity,
  value,
  response,
  submitting,
  onChange,
  onSubmit,
}: {
  activity: LiveActivity;
  value?: LiveResponseValue;
  response?: LiveResponseRecord;
  submitting: boolean;
  onChange: (value: LiveResponseValue) => void;
  onSubmit: (valueOverride?: LiveResponseValue) => void;
}) {
  const [draft, setDraft] = useState("");
  const current = isPrioritizationResponse(value)
    ? value
    : { items: [], finalized: false };
  const maxSelections = activity.maxSelections || 3;
  const minItems = activity.minItems || 1;
  const selectedCount = current.items.filter((item) => item.selected).length;
  const canEdit = activity.status === "open";
  const readyToFinish =
    current.items.length >= minItems && selectedCount > 0;
  const savedValue = response?.value;
  const changed = savedValue
    ? !sameLiveResponseValue(current, savedValue)
    : current.items.length > 0;

  function updateItems(items: typeof current.items) {
    onChange({ items, finalized: false });
  }

  function addItem() {
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text || current.items.length >= 50) return;
    if (
      current.items.some(
        (item) => item.text.toLocaleLowerCase() === text.toLocaleLowerCase(),
      )
    ) {
      setDraft("");
      return;
    }
    updateItems([
      ...current.items,
      { id: crypto.randomUUID(), text: text.slice(0, 280), selected: false },
    ]);
    setDraft("");
  }

  return (
    <div className="border-t border-slate-100 bg-[var(--course-background)] p-4 sm:p-7">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section className="rounded-2xl border border-slate-200 bg-[var(--course-surface)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-45">
                Step 1 · Capture
              </p>
              <h2 className="mt-1 text-lg font-bold">List every routine</h2>
              <p className="mt-1 text-xs leading-5 opacity-60">
                Keep each entry short. Quantity first; you will choose later.
              </p>
            </div>
            <span className="rounded-full bg-[var(--course-background)] px-2.5 py-1 text-xs font-bold opacity-70">
              {current.items.length}/50
            </span>
          </div>
          {canEdit ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <textarea
                value={draft}
                maxLength={280}
                rows={2}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    addItem();
                  }
                }}
                placeholder={activity.entryLabel || "Add an idea"}
                className="min-h-12 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-5 text-slate-950 outline-none focus:border-slate-500"
              />
              <button
                type="button"
                onClick={addItem}
                disabled={!draft.trim() || current.items.length >= 50}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--course-primary)] px-5 text-sm font-bold text-[var(--course-on-primary)] disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          ) : null}
          <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {current.items.map((item, index) => (
              <div
                key={item.id}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-950"
              >
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">
                  {index + 1}
                </span>
                <input
                  value={item.text}
                  maxLength={280}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateItems(
                      current.items.map((candidate) =>
                        candidate.id === item.id
                          ? { ...candidate, text: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium leading-6 outline-none disabled:opacity-70"
                />
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateItems(
                        current.items.filter(
                          (candidate) => candidate.id !== item.id,
                        ),
                      )
                    }
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${item.text}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
            {!current.items.length ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm opacity-45">
                Your routines will collect here.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-[var(--course-surface)] p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-45">
            Step 2 · Shortlist
          </p>
          <h2 className="mt-1 text-lg font-bold">
            Choose up to {maxSelections}
          </h2>
          <p className="mt-1 text-xs leading-5 opacity-60">
            {activity.selectionPrompt || "Choose the ideas you want to take forward."}
          </p>
          <div className="mt-4 space-y-2">
            {current.items.map((item) => {
              const disabled =
                !canEdit || (!item.selected && selectedCount >= maxSelections);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    updateItems(
                      current.items.map((candidate) =>
                        candidate.id === item.id
                          ? { ...candidate, selected: !candidate.selected }
                          : candidate,
                      ),
                    )
                  }
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition",
                    item.selected
                      ? "border-[var(--course-primary)] bg-[var(--course-primary)] text-[var(--course-on-primary)]"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-400",
                    disabled && !item.selected && "opacity-45",
                  )}
                >
                  <Star
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      item.selected && "fill-current",
                    )}
                  />
                  <span className="font-bold leading-5">{item.text}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 rounded-xl bg-[var(--course-background)] p-3 text-xs leading-5 opacity-70">
            {selectedCount} selected · Add at least {minItems} routine
            {minItems === 1 ? "" : "s"} to finish.
          </div>
          {response ? (
            <Saved
              message={
                isPrioritizationResponse(response.value) &&
                response.value.finalized &&
                !changed
                  ? "Shortlist saved"
                  : "Progress saved · You can keep editing while this is open"
              }
            />
          ) : null}
          {canEdit ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  onSubmit({ items: current.items, finalized: false })
                }
                disabled={!current.items.length || submitting || !changed}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-40"
              >
                <Save className="h-4 w-4" /> Save progress
              </button>
              <button
                type="button"
                onClick={() =>
                  onSubmit({ items: current.items, finalized: true })
                }
                disabled={!readyToFinish || submitting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--course-primary)] px-4 text-sm font-bold text-[var(--course-on-primary)] disabled:opacity-40"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Finish shortlist
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Saved({ message = "Response saved" }: { message?: string }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
      <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
    </div>
  );
}
function ResponsesClosed() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
      <LockKeyhole className="h-4 w-4" /> Responses are closed
    </div>
  );
}
function Centered({ message, error }: { message: string; error?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 text-center text-slate-950">
      <div>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          {error ? (
            <LockKeyhole className="h-5 w-5 text-amber-600" />
          ) : (
            <LoaderCircle className="h-5 w-5 animate-spin text-slate-500" />
          )}
        </span>
        <p className="mt-5 max-w-md text-sm leading-6 text-slate-500">
          {message}
        </p>
        {error ? (
          <Link
            href="/join"
            className="mt-5 inline-block text-sm font-bold text-slate-900 underline"
          >
            Try another code
          </Link>
        ) : null}
      </div>
    </main>
  );
}
function orderedOptions(activity: LiveActivity, learnerSeed: string) {
  if (!activity.randomizeOptions) return activity.options;
  return [...activity.options].sort(
    (a, b) =>
      seeded(`${learnerSeed}:${activity.id}:${a.id}`) -
      seeded(`${learnerSeed}:${activity.id}:${b.id}`),
  );
}
function scaleNumber(label = "") {
  return label.match(/\d+/)?.[0] || label;
}
function scaleEndpoint(label = "") {
  return label.replace(/^\s*\d+\s*[·.-]?\s*/, "").trim();
}
function seeded(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1)
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}
function labelFor(type: LiveActivity["type"]) {
  return (
    {
      content: "Workbook",
      setup_check: "Setup check",
      poll: "Quick poll",
      quiz: "Knowledge check",
      prioritization: "Capture and shortlist",
      worksheet: "Workbook activity",
      reflection: "Reflection",
      task: "Practice",
      break: "Break",
    } as const
  )[type];
}
