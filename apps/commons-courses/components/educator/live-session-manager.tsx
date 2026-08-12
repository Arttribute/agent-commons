"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Radio,
  Sparkles,
  Users,
} from "lucide-react";
import type { LiveSessionRecord } from "@/types/live-session";

export function LiveSessionManager({
  courseSlug,
  courseTitle,
}: {
  courseSlug: string;
  courseTitle: string;
}) {
  const [sessions, setSessions] = useState<LiveSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(`${courseTitle} · live workshop`);
  const [template, setTemplate] = useState<"facilitated_workshop" | "blank">(
    "facilitated_workshop",
  );
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/educator/courses/${courseSlug}/live-sessions`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSessions(data.sessions || []);
    else setNotice(data.error || "Could not load live sessions.");
    setLoading(false);
  }, [courseSlug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createSession() {
    if (!title.trim() || creating) return;
    setCreating(true);
    setNotice("");
    const res = await fetch(`/api/educator/courses/${courseSlug}/live-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, template }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.session) {
      window.location.href = `/educator/courses/${courseSlug}/live/${data.session.id}`;
      return;
    }
    setNotice(data.error || "Could not create the session.");
    setCreating(false);
  }

  return (
    <div className="space-y-7" data-copilot-target="live-session-library">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            Facilitation
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Live sessions
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Turn course material into a paced room with a learner workbook,
            setup checks, practice, polls, quizzes, and evidence capture.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#71E0E7]/20 px-3 py-1.5 text-xs font-bold text-slate-700">
          <Radio className="h-3.5 w-3.5" /> In person or hybrid
        </span>
      </header>

      <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[1.05fr_.95fr]">
        <div className="p-6 sm:p-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
            <Plus className="h-5 w-5" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-slate-950">Prepare a room</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Start with a proven workshop rhythm or build a clean run-of-show from scratch.
          </p>
          <label className="mt-6 block text-xs font-bold uppercase tracking-wide text-slate-600">
            Session title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-slate-400"
            />
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TemplateChoice
              active={template === "facilitated_workshop"}
              title="Workshop rhythm"
              body="Setup, diagnostic, content, practice, retrieval, break, and exit reflection."
              onClick={() => setTemplate("facilitated_workshop")}
            />
            <TemplateChoice
              active={template === "blank"}
              title="Blank room"
              body="Start clean and add only the activities this learning moment needs."
              onClick={() => setTemplate("blank")}
            />
          </div>
          {notice ? <p className="mt-4 text-sm text-red-600">{notice}</p> : null}
          <button
            type="button"
            onClick={createSession}
            disabled={creating || !title.trim()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {creating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create session
          </button>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 p-6 sm:p-8 lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
            One coherent learning system
          </p>
          <div className="mt-5 space-y-5">
            <Feature title="Before the room" body="Run setup checks and diagnostics before teaching time is lost." />
            <Feature title="During the room" body="Control the pace, reveal one activity at a time, and see participation live." />
            <Feature title="After the room" body="Keep learner work and results attached to the course instead of scattered across tools." />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-950">Session library</h3>
          <span className="text-xs font-medium text-slate-400">{sessions.length} total</span>
        </div>
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            Loading sessions…
          </div>
        ) : sessions.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/educator/courses/${courseSlug}/live/${session.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <Status value={session.status} />
                  <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                </div>
                <h4 className="mt-4 text-base font-bold text-slate-950">{session.title}</h4>
                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />{session.activities.length} activities</span>
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{session.participantCount} joined</span>
                  <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{session.pace === "facilitator" ? "Facilitator paced" : "Learner paced"}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Radio className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-800">No live rooms yet</p>
            <p className="mt-1 text-sm text-slate-500">Create one above and shape it around your session.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function TemplateChoice({ active, title, body, onClick }: { active: boolean; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left transition ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:border-slate-300"}`}>
      <span className="text-sm font-bold">{title}</span>
      <span className={`mt-1 block text-xs leading-5 ${active ? "text-slate-300" : "text-slate-500"}`}>{body}</span>
    </button>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return <div className="border-l-2 border-[#71E0E7] pl-4"><p className="text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-sm leading-6 text-slate-500">{body}</p></div>;
}

function Status({ value }: { value: LiveSessionRecord["status"] }) {
  const styles = value === "live" ? "bg-red-50 text-red-700" : value === "lobby" ? "bg-cyan-50 text-cyan-700" : value === "ended" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles}`}>{value}</span>;
}
