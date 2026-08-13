"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FlaskConical,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { CourseAgentDrawer } from "@/components/course-agents/course-agent-drawer";
import { CourseMaterialViewer } from "@/components/course-material-viewer";
import { cn } from "@/lib/utils";
import type { LearnerLiveSession, LiveActivity, LiveResponseRecord } from "@/types/live-session";
import type { LiveSessionState } from "@/types/live-session";

export function LiveLearnerRoom({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<LearnerLiveSession | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState<"connecting" | "synced" | "reconnecting" | "offline">("connecting");
  const stateVersionRef = useRef(-1);
  const requestRef = useRef(0);
  const lastSyncRef = useRef(0);
  const sessionStatus = session?.status;

  const load = useCallback(async (quiet = false) => {
    const requestId = ++requestRef.current;
    if (!quiet) setLoading(true);
    const res = await fetch(`/api/live-sessions/${sessionId}`, { cache: "no-store" }).catch(() => null);
    if (!res) {
      if (requestId === requestRef.current) setConnection(navigator.onLine ? "reconnecting" : "offline");
      if (!quiet) setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (requestId !== requestRef.current) return;
    if (!res.ok) {
      setNotice(data.error || "Could not enter this live session.");
      if (!quiet) setLoading(false);
      return;
    }
    const next = data.session as LearnerLiveSession;
    setSession(next);
    stateVersionRef.current = next.stateVersion;
    lastSyncRef.current = Date.now();
    setConnection("synced");
    setSelectedId((current) => {
      const visible = next.activities.filter((item) => item.status !== "draft");
      const desired = next.pace === "facilitator"
        ? next.currentActivityId || visible.find((item) => item.status === "open")?.id
        : current || visible[0]?.id;
      return visible.some((item) => item.id === desired) ? desired || "" : visible[0]?.id || "";
    });
    setValues((current) => ({ ...Object.fromEntries(Object.values(next.responses).map((response) => [response.activityId, response.value])), ...current }));
    setNotice("");
    if (!quiet) setLoading(false);
  }, [sessionId]);

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
        const res = await fetch(`/api/live-sessions/${sessionId}/state`, { cache: "no-store" });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Room state unavailable");
        if (cancelled) return;
        const state = payload.state as LiveSessionState;
        lastSyncRef.current = Date.now();
        setConnection("synced");
        if (state.stateVersion !== stateVersionRef.current) {
          await load(true);
        } else {
          setSession((current) => current ? {
            ...current,
            status: state.status,
            pace: state.pace,
            currentActivityId: state.currentActivityId,
            activities: current.activities.map((item) => ({
              ...item,
              status: state.activityStatuses[item.id] || item.status,
            })),
          } : current);
          if (state.pace === "facilitator" && state.currentActivityId) {
            setSelectedId(state.currentActivityId);
          }
        }
      } catch {
        if (!cancelled) setConnection(navigator.onLine ? "reconnecting" : "offline");
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
  }, [load, sessionId, sessionStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lastSyncRef.current && Date.now() - lastSyncRef.current > 5000) {
        setConnection(navigator.onLine ? "reconnecting" : "offline");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activity = session?.activities.find((item) => item.id === selectedId);
  const activityIndex = session?.activities.findIndex((item) => item.id === selectedId) ?? -1;
  const response = activity ? session?.responses[activity.id] : undefined;
  const availableActivities = useMemo(() => session?.activities.filter((item) => item.status !== "draft") || [], [session?.activities]);

  async function submit(valueOverride?: string | string[]) {
    if (!activity || submitting) return;
    const value = valueOverride ?? values[activity.id];
    if ((typeof value === "string" && !value.trim()) || value === undefined) return;
    setSubmitting(true);
    setNotice("");
    const res = await fetch(`/api/live-sessions/${sessionId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityId: activity.id, value }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSession((current) => current ? { ...current, responses: { ...current.responses, [activity.id]: data.response as LiveResponseRecord } } : current);
      if (session?.pace === "learner") goNext();
    } else setNotice(data.error || "Could not save your response.");
    setSubmitting(false);
  }

  function goNext() {
    if (!session) return;
    const index = availableActivities.findIndex((item) => item.id === selectedId);
    const next = availableActivities[index + 1];
    if (next) setSelectedId(next.id);
  }

  if (loading) return <Centered message="Entering the live room…" />;
  if (!session) return <Centered message={notice || "This session is unavailable."} error />;
  if (session.status === "lobby") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12 text-white">
        <div className="w-full max-w-lg text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10"><Radio className="h-6 w-6 text-[#71E0E7]" /></span><p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-[#71E0E7]">You’re in the room</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{session.title}</h1><p className="mt-4 text-sm leading-6 text-slate-400">The facilitator will begin shortly. Keep this page open; your workbook will update automatically.</p><div className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-slate-300"><Users className="h-4 w-4" />{session.participantCount} joined</div><LoaderCircle className="mx-auto mt-8 h-5 w-5 animate-spin text-slate-500" /></div>
      </main>
    );
  }

  if (session.status === "ended" && !activity) return <Centered message="This live session has ended. Your responses are saved with your course." />;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard" className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white"><FlaskConical className="h-4 w-4" /></Link>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{session.title}</p><p className="text-[10px] font-bold uppercase tracking-widest text-red-600">{session.status === "ended" ? "Session ended" : "Live now"}</p></div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold", connection === "synced" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}><span className={cn("h-1.5 w-1.5 rounded-full", connection === "synced" ? "bg-emerald-500" : "animate-pulse bg-amber-500")} />{connection === "synced" ? "In sync" : connection === "offline" ? "Offline" : "Reconnecting"}</span>
          <span className="hidden items-center gap-1.5 text-xs text-slate-400 sm:inline-flex"><Users className="h-3.5 w-3.5" />{session.participantCount}</span>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:py-10">
        <aside className="hidden lg:block"><div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-3"><p className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Your workbook</p><div className="mt-1 space-y-1">{session.activities.map((item, index) => { const locked = item.status === "draft"; const done = Boolean(session.responses[item.id]); return <button key={item.id} disabled={locked || session.pace === "facilitator"} onClick={() => setSelectedId(item.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", item.id === activity?.id ? "bg-slate-950 text-white" : locked ? "text-slate-300" : "text-slate-600 hover:bg-slate-50")}><span className="text-[10px] font-bold opacity-50">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{item.title}</span>{locked ? <LockKeyhole className="h-3.5 w-3.5" /> : done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : null}</button>; })}</div></div></aside>
        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between text-xs text-slate-400"><span>Activity {activityIndex + 1} of {session.activities.length}</span>{activity?.estimatedMinutes ? <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{activity.estimatedMinutes} min</span> : null}</div>
          {activity ? <LearnerActivity activity={activity} learnerSeed={session.participant.id} value={values[activity.id]} response={response} submitting={submitting} onChange={(value) => setValues((current) => ({ ...current, [activity.id]: value }))} onSubmit={submit} /> : <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Radio className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-4 text-sm font-bold text-slate-700">The room is live. No activity is open yet.</p><p className="mt-2 text-xs leading-5 text-slate-400">Keep this page open. The next activity will appear here as soon as the facilitator presents it.</p>{connection !== "synced" ? <button onClick={() => void load(true)} className="mt-5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Reconnect now</button> : null}</div>}
          {notice ? <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p> : null}
          {session.pace === "learner" && activity ? <div className="mt-5 flex justify-between"><button disabled={availableActivities.findIndex((item) => item.id === activity.id) <= 0} onClick={() => { const index = availableActivities.findIndex((item) => item.id === activity.id); setSelectedId(availableActivities[index - 1]?.id || activity.id); }} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 disabled:opacity-30"><ArrowLeft className="h-4 w-4" /> Previous</button><button onClick={goNext} className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">Next <ArrowRight className="h-4 w-4" /></button></div> : null}
        </section>
      </div>
      <CourseAgentDrawer courseSlug={session.courseSlug} role="learner" context={{ page: "live_session", title: activity?.title || session.title, visibleText: [activity?.prompt, activity?.instructions, activity?.successCriteria].filter(Boolean).join("\n") }} />
    </main>
  );
}

function LearnerActivity({ activity, learnerSeed, value, response, submitting, onChange, onSubmit }: { activity: LiveActivity; learnerSeed: string; value?: string | string[]; response?: LiveResponseRecord; submitting: boolean; onChange: (value: string | string[]) => void; onSubmit: (valueOverride?: string | string[]) => void }) {
  const isChoice = activity.options.length > 0;
  const result = activity.status === "closed" && activity.showResults;
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="p-6 sm:p-9"><div className="flex items-center justify-between"><span className="rounded-full bg-[#71E0E7]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-700">{labelFor(activity.type)}</span>{activity.required ? <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Required</span> : null}</div><h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-950">{activity.title}</h1>{activity.prompt ? <p className="mt-4 text-lg leading-8 text-slate-700">{activity.prompt}</p> : null}{activity.instructions ? <div className="mt-6 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">{activity.instructions}</div> : null}{activity.successCriteria ? <div className="mt-4 border-l-2 border-[#B8F56D] pl-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Done when</p><p className="mt-1 text-sm leading-6 text-slate-700">{activity.successCriteria}</p></div> : null}{activity.resourceUrl ? <a href={activity.resourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-700 underline underline-offset-4">Open activity resource <ExternalLink className="h-4 w-4" /></a> : null}</div>{activity.materialId ? <div className="border-t border-slate-100 p-4 sm:p-6"><CourseMaterialViewer materialId={activity.materialId} compact /></div> : null}
    {isChoice ? <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-7"><div className="grid gap-3 sm:grid-cols-2">{orderedOptions(activity, learnerSeed).map((option) => { const selected = value === option.id || (Array.isArray(value) && value.includes(option.id)); return <button key={option.id} disabled={activity.status !== "open" || Boolean(response)} onClick={() => onChange(option.id)} className={cn("min-h-16 rounded-xl border bg-white p-4 text-left text-sm font-bold transition", selected ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200 hover:border-slate-400", result && option.isCorrect && "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500", response && !result && "disabled:opacity-70")}>{option.label}{result && option.isCorrect ? <Check className="ml-2 inline h-4 w-4 text-emerald-600" /> : null}</button>; })}</div>{response ? <Saved /> : <button onClick={() => onSubmit()} disabled={!value || submitting || activity.status !== "open"} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit response</button>}</div> : activity.type === "content" || activity.type === "break" ? <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-7">{response ? <Saved /> : <button onClick={() => onSubmit("complete")} disabled={submitting || activity.status !== "open"} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"><Check className="h-4 w-4" /> {activity.type === "break" ? "I’m back" : "Mark as viewed"}</button>}</div> : <div className="border-t border-slate-100 bg-slate-50 p-5 sm:p-7"><textarea value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} disabled={activity.status !== "open" || Boolean(response)} rows={6} placeholder={activity.type === "task" ? "Add a short response, link, or note about your artefact…" : "Write your response…"} className="w-full resize-y rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 outline-none focus:border-slate-400 disabled:bg-slate-100" />{response ? <Saved /> : <button onClick={() => onSubmit()} disabled={!value || submitting || activity.status !== "open"} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Save response</button>}</div>}</article>;
}

function Saved() { return <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Response saved</div>; }
function Centered({ message, error }: { message: string; error?: boolean }) { return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-center text-white"><div><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">{error ? <LockKeyhole className="h-5 w-5 text-amber-300" /> : <Sparkles className="h-5 w-5 text-[#71E0E7]" />}</span><p className="mt-5 max-w-md text-sm leading-6 text-slate-300">{message}</p>{error ? <Link href="/join" className="mt-5 inline-block text-sm font-bold text-white underline">Try another code</Link> : null}</div></main>; }
function orderedOptions(activity: LiveActivity, learnerSeed: string) { if (!activity.randomizeOptions) return activity.options; return [...activity.options].sort((a, b) => seeded(`${learnerSeed}:${activity.id}:${a.id}`) - seeded(`${learnerSeed}:${activity.id}:${b.id}`)); }
function seeded(value: string) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0; return Math.abs(hash); }
function labelFor(type: LiveActivity["type"]) { return ({ content: "Workbook", setup_check: "Setup check", poll: "Quick poll", quiz: "Knowledge check", reflection: "Reflection", task: "Practice", break: "Break" } as const)[type]; }
