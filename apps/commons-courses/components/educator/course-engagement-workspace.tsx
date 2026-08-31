"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HeartHandshake,
  MessageSquareText,
  Search,
  Send,
  Users,
} from "lucide-react";
import type {
  EngagementActivity,
  EngagementLearner,
  EngagementSummary,
} from "@/types/course-engagement";

type SessionOption = {
  id: string;
  title: string;
  status: string;
  date: string;
  participantCount: number;
  responseCount: number;
};

type FollowUp = {
  id: string;
  title: string;
  published: boolean;
  dueAt?: string;
  targetCount: number;
  submissionCount: number;
  reviewedCount: number;
};

export function CourseEngagementWorkspace({
  slug,
  sessions,
  selectedSessionId,
  summary,
  activities,
  learners,
  followUps,
}: {
  slug: string;
  sessions: SessionOption[];
  selectedSessionId?: string;
  summary?: EngagementSummary;
  activities: EngagementActivity[];
  learners: EngagementLearner[];
  followUps: FollowUp[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "activities" | "learners">("overview");
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>(learners.map((item) => item.userId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "Your AI Quick Wins outcome check-in",
    context: "",
    instructions:
      "Look back at your outcome contract, then share: the steps you have taken; what changed; how you are measuring progress; your next step and date; and any blocker or support you need.",
    dueAt: "",
    notifyNow: false,
  });

  const visibleLearners = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return learners;
    return learners.filter((learner) =>
      `${learner.name} ${learner.email}`.toLowerCase().includes(normalized),
    );
  }, [learners, query]);
  const responseActivities = activities.filter((item) => item.responseCount > 0);

  async function createCheckIn(event: FormEvent) {
    event.preventDefault();
    if (!selectedSessionId || !selectedUsers.length) return;
    setSaving(true);
    setError("");
    const response = await fetch(
      `/api/educator/courses/${slug}/engagement/check-ins`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sessionId: selectedSessionId, targetUserIds: selectedUsers }),
      },
    );
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not create this check-in.");
      return;
    }
    setComposerOpen(false);
    router.refresh();
  }

  if (!selectedSessionId || !summary) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Insights will appear after your first live session"
        copy="Responses, participation signals, and follow-up tools will be organized here automatically."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Learning relationships</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Engagement</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Understand what learners did, notice who may need support, and continue the work after a live session.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"
        >
          <HeartHandshake className="h-4 w-4" /> Create check-in
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 px-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-bold text-slate-900">Session</span>
        </div>
        <select
          value={selectedSessionId}
          onChange={(event) => router.push(`/educator/courses/${slug}/engagement?session=${event.target.value}`)}
          className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none sm:min-w-80"
        >
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title} · {session.participantCount} learners · {session.responseCount} responses
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Attended" value={summary.attendees} icon={Users} />
        <Metric label="Participated" value={summary.engagedLearners} icon={CheckCircle2} />
        <Metric label="Participation" value={`${summary.participationRate}%`} icon={BarChart3} />
        <Metric label="Responses" value={summary.responseCount} icon={MessageSquareText} />
        <Metric label="Quiz accuracy" value={summary.quizAccuracy === undefined ? "—" : `${summary.quizAccuracy}%`} icon={CheckCircle2} />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(["overview", "activities", "learners"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`border-b-2 px-4 py-3 text-sm font-bold capitalize ${tab === item ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-bold text-slate-950">Strongest signals</h3>
            <p className="mt-1 text-sm text-slate-500">Activities with the most learner evidence.</p>
            <div className="mt-5 space-y-4">
              {[...responseActivities].sort((a, b) => b.responseCount - a.responseCount).slice(0, 6).map((activity) => (
                <button key={activity.id} onClick={() => setTab("activities")} className="flex w-full items-center gap-4 text-left">
                  <span className="w-8 text-xs font-bold text-slate-400">{String(activity.index).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{activity.title}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-slate-950" style={{ width: `${activity.responseRate}%` }} /></span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{activity.responseCount} · {activity.responseRate}%</span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-bold text-slate-950">Continuity</h3>
            <p className="mt-1 text-sm text-slate-500">Accountability that continues after the room closes.</p>
            <div className="mt-5 space-y-3">
              {followUps.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-900">{item.title}</p>
                    {!item.published && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Draft</span>}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{item.submissionCount}/{item.targetCount} responded · {item.reviewedCount} reviewed</p>
                </div>
              ))}
              {!followUps.length && <p className="rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">No check-ins yet. Create one to turn learners’ plans into an ongoing conversation.</p>}
            </div>
            <Link href={`/educator/courses/${slug}/assignments`} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-slate-900">Review responses <ArrowRight className="h-4 w-4" /></Link>
          </section>
        </div>
      )}

      {tab === "activities" && (
        <div className="space-y-3">
          {activities.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
        </div>
      )}

      {tab === "learners" && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-bold text-slate-950">Learner participation</h3><p className="text-sm text-slate-500">Private to course educators.</p></div>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a learner" className="w-full bg-transparent text-sm outline-none" /></label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Learner</th><th className="px-4 py-3">Participation</th><th className="px-4 py-3">Responses</th><th className="px-4 py-3">Quiz</th><th className="px-4 py-3">Last active</th></tr></thead>
              <tbody>{visibleLearners.map((learner) => <tr key={learner.participantId} className="border-t border-slate-100"><td className="px-4 py-4"><p className="font-bold text-slate-900">{learner.name}</p><p className="text-xs text-slate-500">{learner.email}</p></td><td className="px-4 py-4 font-semibold">{learner.responseRate}%</td><td className="px-4 py-4">{learner.responseCount}</td><td className="px-4 py-4">{learner.quizTotal ? `${learner.quizCorrect}/${learner.quizTotal}` : "—"}</td><td className="px-4 py-4 text-slate-500">{formatDate(learner.lastSeenAt)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {composerOpen && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/30" onMouseDown={() => setComposerOpen(false)}>
          <form onSubmit={createCheckIn} onMouseDown={(event) => event.stopPropagation()} className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Continue the learning</p><h3 className="mt-2 text-2xl font-bold text-slate-950">Create a check-in</h3><p className="mt-2 text-sm leading-6 text-slate-600">Learners can respond with an update or link. Their response and your feedback remain available after the session.</p></div><button type="button" onClick={() => setComposerOpen(false)} className="text-2xl text-slate-400">×</button></div>
            <div className="mt-7 space-y-5">
              <label className="block text-sm font-bold text-slate-800">Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-slate-400" /></label>
              <label className="block text-sm font-bold text-slate-800">Shared follow-up focus <span className="font-normal text-slate-400">(optional)</span><textarea value={form.context} onChange={(event) => setForm({ ...form, context: event.target.value })} placeholder="Use this only when every selected learner should see the same focus." className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-slate-400" /><span className="mt-2 block text-xs font-normal leading-5 text-slate-500">Leave this blank to recall each learner’s own outcome contract, chosen task, commitment, or final reflection from the live session.</span></label>
              <label className="block text-sm font-bold text-slate-800">Prompt<textarea required value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} className="mt-2 min-h-36 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal leading-6 outline-none focus:border-slate-400" /></label>
              <label className="block text-sm font-bold text-slate-800">Due date <span className="font-normal text-slate-400">(optional)</span><input type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none" /></label>
              <div><div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-800">Learners</p><button type="button" onClick={() => setSelectedUsers(selectedUsers.length === learners.length ? [] : learners.map((item) => item.userId))} className="text-xs font-bold text-slate-500">{selectedUsers.length === learners.length ? "Clear all" : "Select all"}</button></div><div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">{learners.map((learner) => <label key={learner.userId} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50"><input type="checkbox" checked={selectedUsers.includes(learner.userId)} onChange={() => setSelectedUsers((current) => current.includes(learner.userId) ? current.filter((id) => id !== learner.userId) : [...current, learner.userId])} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{learner.name}</span><span className="block truncate text-xs text-slate-400">{learner.email}</span></span></label>)}</div><p className="mt-2 text-xs text-slate-500">{selectedUsers.length} learner{selectedUsers.length === 1 ? "" : "s"} selected</p></div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <input type="checkbox" checked={form.notifyNow} onChange={(event) => setForm({ ...form, notifyNow: event.target.checked })} className="mt-0.5" />
                <span><span className="block text-sm font-bold text-slate-800">Email learners now</span><span className="mt-1 block text-xs leading-5 text-slate-500">Leave this off to save a private educator draft. Each learner’s own contract or chosen focus will be recalled automatically.</span></span>
              </label>
              {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button disabled={saving || !selectedUsers.length} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" />{saving ? "Creating…" : form.notifyNow ? "Create and notify learners" : "Save check-in draft"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><Icon className="h-4 w-4 text-slate-400" /><p className="mt-4 text-2xl font-bold text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>; }

function ActivityRow({ activity }: { activity: EngagementActivity }) {
  const [open, setOpen] = useState(false);
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><button onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-4 p-4 text-left"><span className="text-xs font-bold text-slate-400">{String(activity.index).padStart(2, "0")}</span><span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{activity.title}</span><span className="text-xs capitalize text-slate-500">{activity.type} · {activity.responseCount} responses · {activity.responseRate}% of attendees{activity.correctRate === undefined ? "" : ` · ${activity.correctRate}% correct`}</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} /></button>{open && <div className="border-t border-slate-100 bg-slate-50 p-4">{activity.options.length > 0 && <div className="mb-5 grid gap-2 sm:grid-cols-2">{activity.options.map((option) => <div key={option.label} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex justify-between gap-3 text-sm"><span className="font-semibold text-slate-800">{option.label}</span><span className="text-slate-500">{option.count} · {option.percent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${option.percent}%` }} /></div></div>)}</div>}<div className="space-y-2">{activity.responses.map((response, index) => <div key={`${response.userId}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-500">{response.participantName}</p><p className="text-xs text-slate-400">{formatDate(response.submittedAt)}</p></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{response.value}</p></div>)}{!activity.responses.length && <p className="text-sm text-slate-500">No learner responses for this activity.</p>}</div></div>}</section>;
}

function EmptyState({ icon: Icon, title, copy }: { icon: typeof BarChart3; title: string; copy: string }) { return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center"><Icon className="mx-auto h-6 w-6 text-slate-300" /><h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{copy}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
