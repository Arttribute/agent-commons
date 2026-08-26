"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock3, Coins, Database, Loader2, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Run = { traceId: string; status: string; captureMode: string; modelId?: string; startedAt: string; endedAt?: string; durationMs?: number; inputTokens?: number; outputTokens?: number; cachedTokens?: number; costUsd?: number; anchorStatus?: string; bundleHash?: string };
type Event = { eventId: string; traceId: string; sequence: number; category: "input" | "model" | "tool" | "output" | "system" | "error"; name?: string; summary?: string; eventType: string; status: string; payload?: unknown; result?: unknown; eaaAction?: unknown; startedAt: string; endedAt?: string; durationMs?: number; inputTokens?: number; outputTokens?: number; cachedTokens?: number; costUsd?: number; contentHash?: string };
type Trajectory = { sessionId: string; runs: Run[]; events: Event[]; summary: { durationMs?: number; eventCount?: number; modelCalls?: number; toolCalls?: number; inputTokens?: number; outputTokens?: number; cachedTokens?: number; costUsd?: number } };

const colors: Record<Event["category"], string> = { input: "bg-sky-500", model: "bg-violet-500", tool: "bg-amber-500", output: "bg-emerald-500", system: "bg-slate-400", error: "bg-red-500" };
const labels: Record<Event["category"], string> = { input: "USER", model: "MODEL", tool: "TOOL", output: "OUTPUT", system: "SYSTEM", error: "ERROR" };
const fmt = (value?: number) => value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
const ms = (value?: number) => value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;

export function TrajectoryView({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<Trajectory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Event | null>(null);
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/provenance/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Could not load provenance");
    setData(body.data); setError(null);
  }, [sessionId]);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!data?.runs.some((run) => run.status === "running")) return;
    const id = window.setInterval(() => void load().catch(() => undefined), 1500);
    return () => window.clearInterval(id);
  }, [data?.runs, load]);
  const events = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return !needle ? data?.events ?? [] : (data?.events ?? []).filter((event) => `${event.name} ${event.summary} ${event.eventType} ${event.category}`.toLowerCase().includes(needle));
  }, [data?.events, query]);
  const bounds = useMemo(() => {
    const starts = (data?.events ?? []).map((event) => new Date(event.startedAt).getTime());
    const ends = (data?.events ?? []).map((event) => new Date(event.endedAt ?? event.startedAt).getTime());
    return { start: Math.min(...starts), span: Math.max(1, Math.max(...ends) - Math.min(...starts)) };
  }, [data?.events]);
  if (!data && !error) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading provenance…</div>;
  if (error) return <div className="flex h-full items-center justify-center text-sm text-destructive"><AlertCircle className="mr-2 h-4 w-4" />{error}</div>;
  const summary = data!.summary;
  return (
    <div className="flex h-full min-h-0 bg-page">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{ms(summary.durationMs)}</span>
          <span>{data!.runs.length} run{data!.runs.length === 1 ? "" : "s"}</span>
          <span>{summary.modelCalls ?? 0} model · {summary.toolCalls ?? 0} tool</span>
          <span>{fmt((summary.inputTokens ?? 0) + (summary.outputTokens ?? 0))} tokens</span>
          <span className="inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5" />${(summary.costUsd ?? 0).toFixed(4)}</span>
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />{data!.runs[0]?.captureMode ?? "metadata"}</span>
          <label className="ml-auto flex min-w-48 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"><Search className="h-3.5 w-3.5" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trajectory" className="w-full bg-transparent outline-none" /></label>
        </div>
        {data!.events.length > 0 && (
          <div className="border-b border-border bg-muted/20 px-4 py-3">
            <div className="relative h-14 overflow-hidden rounded-md border border-border/70 bg-background">
              {data!.events.map((event) => { const start = (new Date(event.startedAt).getTime() - bounds.start) / bounds.span * 100; const width = Math.max(0.8, ((new Date(event.endedAt ?? event.startedAt).getTime() - new Date(event.startedAt).getTime()) / bounds.span) * 100); const row = event.category === "tool" ? 34 : event.category === "model" ? 18 : 2; return <button key={event.eventId} title={event.name ?? event.eventType} onClick={() => setSelected(event)} className={cn("absolute h-3 rounded-sm opacity-85 transition-opacity hover:opacity-100", colors[event.category])} style={{ left: `${Math.min(start, 99)}%`, width: `${Math.min(width, 100 - start)}%`, top: row }} />; })}
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {events.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Database className="h-6 w-6" /><span>{data!.events.length ? "No matching events" : "No provenance events yet"}</span><span className="max-w-sm text-xs">New runs record metadata by default. Raw prompts and outputs require explicit full-capture mode.</span></div> : events.map((event) => (
            <button key={event.eventId} onClick={() => setSelected(event)} className={cn("grid w-full grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-muted/40", selected?.eventId === event.eventId && "bg-muted/60")}>
              <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold text-white", colors[event.category])}>{labels[event.category]}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{event.name ?? event.eventType}</span><span className="block truncate text-xs text-muted-foreground">{event.summary ?? event.eventType}</span></span>
              <span className="text-xs tabular-nums text-muted-foreground">{ms(event.durationMs)}</span>
            </button>
          ))}
        </div>
      </div>
      {selected && <aside className="hidden w-[40%] max-w-xl min-w-80 border-l border-border bg-background lg:flex lg:flex-col">
        <div className="flex items-center border-b border-border px-4 py-3"><span className={cn("mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white", colors[selected.category])}>{labels[selected.category]}</span><span className="truncate text-sm font-medium">{selected.name ?? selected.eventType}</span><button onClick={() => setSelected(null)} className="ml-auto text-muted-foreground hover:text-foreground">×</button></div>
        <div className="space-y-5 overflow-y-auto p-4 text-xs"><section><h3 className="mb-2 font-semibold">Summary</h3><dl className="grid grid-cols-[6rem_1fr] gap-2 text-muted-foreground"><dt>Status</dt><dd className="text-foreground">{selected.status}</dd><dt>Event</dt><dd className="text-foreground">{selected.eventType}</dd><dt>Duration</dt><dd className="text-foreground">{ms(selected.durationMs)}</dd><dt>Tokens</dt><dd className="text-foreground">{fmt((selected.inputTokens ?? 0) + (selected.outputTokens ?? 0))}</dd><dt>Hash</dt><dd className="break-all font-mono text-foreground">{selected.contentHash ?? "—"}</dd></dl></section>{selected.payload != null && <Json title="Payload" value={selected.payload} />}{selected.result != null && <Json title="Result" value={selected.result} />}<Json title="EAA action" value={selected.eaaAction} /></div>
      </aside>}
    </div>
  );
}

function Json({ title, value }: { title: string; value: unknown }) { return <section><h3 className="mb-2 font-semibold">{title}</h3><pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[11px] leading-5">{JSON.stringify(value, null, 2)}</pre></section>; }
