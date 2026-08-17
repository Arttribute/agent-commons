"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Flag,
  HeartHandshake,
  Send,
} from "lucide-react";

type CheckInStatus = "not_started" | "in_progress" | "blocked" | "completed";

type CheckIn = {
  id: string;
  title: string;
  instructions: string;
  context?: string;
  dueAt?: string;
};

type Submission = {
  id: string;
  assignmentId: string;
  text?: string;
  url?: string;
  status: string;
  checkInStatus?: CheckInStatus;
  feedback?: string;
  submittedAt: string;
};

const statuses: Array<{
  id: CheckInStatus;
  label: string;
  detail: string;
  icon: typeof Circle;
}> = [
  { id: "not_started", label: "Not started", detail: "I have not begun yet", icon: Circle },
  { id: "in_progress", label: "In progress", detail: "I am actively working on it", icon: Clock3 },
  { id: "blocked", label: "I’m stuck", detail: "I need help to move forward", icon: Flag },
  { id: "completed", label: "Done", detail: "I completed what I planned", icon: CheckCircle2 },
];

export function LearnerCheckIns({
  course,
  checkIns,
  submissions: initialSubmissions,
  initialCheckInId,
}: {
  course: { title: string; slug: string };
  checkIns: CheckIn[];
  submissions: Submission[];
  initialCheckInId?: string;
}) {
  const [selectedId, setSelectedId] = useState(
    checkIns.some((item) => item.id === initialCheckInId)
      ? initialCheckInId
      : checkIns[0]?.id,
  );
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const selected = useMemo(
    () => checkIns.find((item) => item.id === selectedId),
    [checkIns, selectedId],
  );
  const submission = submissions.find((item) => item.assignmentId === selectedId);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <header className="mt-8 border-b border-slate-200 pb-7">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
            <HeartHandshake className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              {course.title}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Your check-ins
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              A simple space to keep your commitment moving and ask your facilitators for support.
            </p>
          </div>
        </div>
      </header>

      {!selected ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
          <h2 className="mt-4 text-lg font-bold text-slate-900">You are all caught up</h2>
          <p className="mt-2 text-sm text-slate-500">There are no open check-ins for this course.</p>
        </div>
      ) : (
        <div className={`mt-8 grid gap-6 ${checkIns.length > 1 ? "lg:grid-cols-[260px_1fr]" : ""}`}>
          {checkIns.length > 1 && (
            <aside className="space-y-2">
              {checkIns.map((item) => {
                const saved = submissions.find((entry) => entry.assignmentId === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full rounded-xl border p-4 text-left ${selectedId === item.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"}`}
                  >
                    <span className="block text-sm font-bold">{item.title}</span>
                    <span className={`mt-1 block text-xs ${selectedId === item.id ? "text-slate-300" : "text-slate-500"}`}>
                      {saved ? statusLabel(saved.checkInStatus) : "Waiting for your update"}
                    </span>
                  </button>
                );
              })}
            </aside>
          )}
          <CheckInForm
            key={selected.id}
            checkIn={selected}
            submission={submission}
            onSaved={(saved) =>
              setSubmissions((current) => [
                saved,
                ...current.filter((item) => item.assignmentId !== saved.assignmentId),
              ])
            }
          />
        </div>
      )}
    </main>
  );
}

function CheckInForm({
  checkIn,
  submission,
  onSaved,
}: {
  checkIn: CheckIn;
  submission?: Submission;
  onSaved: (submission: Submission) => void;
}) {
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus>(
    submission?.checkInStatus || "in_progress",
  );
  const [text, setText] = useState(submission?.text || "");
  const [url, setUrl] = useState(submission?.url || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(submission));
  const [error, setError] = useState("");
  const startedRef = useRef(Boolean(submission));

  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    fetch(`/api/assignments/${checkIn.id}/check-in-progress`, {
      method: "POST",
    }).catch(() => {
      startedRef.current = false;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch(`/api/assignments/${checkIn.id}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, url, checkInStatus }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not save your check-in.");
      return;
    }
    const next = {
      ...data.submission,
      id: String(data.submission._id || data.submission.id),
      assignmentId: String(data.submission.assignmentId),
    } as Submission;
    setSaved(true);
    onSaved(next);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Accountability check-in</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{checkIn.title}</h2>
          </div>
          {checkIn.dueAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
              <CalendarDays className="h-3.5 w-3.5" /> Due {formatDate(checkIn.dueAt)}
            </span>
          )}
        </div>
      </div>
      <form onSubmit={submit} className="space-y-7 p-5 sm:p-7">
        {checkIn.context && (
          <div className="rounded-xl border border-[var(--course-accent,#cbd5e1)] bg-[var(--course-muted,#f8fafc)] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">What you committed to</p>
            <div
              tabIndex={0}
              className="mt-2 max-h-56 overflow-y-auto overscroll-contain pr-2 focus:outline-none focus:ring-2 focus:ring-slate-300 sm:max-h-64"
            >
              <p className="whitespace-pre-wrap text-base font-semibold leading-7 text-slate-900">“{checkIn.context}”</p>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-bold text-slate-900">Where are you now?</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {statuses.map((item) => {
              const Icon = item.icon;
              const active = checkInStatus === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setCheckInStatus(item.id);
                    markStarted();
                  }}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:border-slate-400"}`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-emerald-300" : "text-slate-400"}`} />
                  <span><span className="block text-sm font-bold">{item.label}</span><span className={`mt-0.5 block text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>{item.detail}</span></span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor={`check-in-${checkIn.id}`} className="text-sm font-bold text-slate-900">Tell your facilitators how it is going</label>
          <p className="mt-1 text-sm leading-6 text-slate-500">{checkIn.instructions}</p>
          <textarea
            id={`check-in-${checkIn.id}`}
            required
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (event.target.value.trim()) markStarted();
            }}
            placeholder="What have you tried? What happened? What will you do next, or where are you stuck?"
            className="mt-3 min-h-40 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-slate-500"
          />
        </div>
        <label className="block text-sm font-bold text-slate-900">Evidence or working link <span className="font-normal text-slate-400">(optional)</span><span className="relative mt-2 block"><ExternalLink className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={url} onChange={(event) => { setUrl(event.target.value); if (event.target.value.trim()) markStarted(); }} placeholder="https://…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm font-normal outline-none focus:border-slate-500" /></span></label>
        {submission?.feedback && <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Facilitator response</p><p className="mt-2 text-sm leading-6 text-emerald-950">{submission.feedback}</p></div>}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{saved ? "Your update is saved. You can return and revise it." : "Only your course educators can see this response."}</p>
          <button disabled={saving || !text.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" />{saving ? "Saving…" : saved ? "Update check-in" : "Send update"}</button>
        </div>
      </form>
    </section>
  );
}

function statusLabel(status?: CheckInStatus) {
  return statuses.find((item) => item.id === status)?.label || "Update received";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}
