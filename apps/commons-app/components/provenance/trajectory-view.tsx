"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Clock3,
  Coins,
  Database,
  ExternalLink,
  Library,
  Loader2,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Run = {
  traceId: string;
  status: string;
  captureMode: string;
  modelId?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  anchorStatus?: string;
  bundleHash?: string;
};
type Lineage = {
  kind?: string;
  query?: { text?: string };
  tool?: { name?: string; provider?: string };
  sources?: Array<{
    url: string;
    domain: string;
    title?: string;
    rank?: number;
    publishedAt?: string;
  }>;
  delegation?: {
    fromAgentId?: string;
    toAgentId?: string;
    role?: string;
    architecture?: string;
  };
  library?: {
    query?: string;
    embedding?: { model?: string; dimensions?: number; computedBy?: string };
    results?: Array<{
      itemId: string;
      name?: string;
      percentageMatch?: number;
      rank?: number;
      sourceUri?: string;
      embeddingModel?: string;
    }>;
  };
  workflow?: {
    workflowId?: string;
    executionId?: string;
    nodeId?: string;
    nodeType?: string;
  };
  decision?: {
    type?: string;
    outcome?: string | boolean;
    rule?: string;
    approval?: {
      requesterId?: string;
      reviewerId?: string;
      reviewerType?: string;
      prompt?: string;
    responseFieldNames?: string[];
    responseHash?: string;
    note?: string;
    reason?: string;
    };
  };
};
type Event = {
  eventId: string;
  traceId: string;
  sequence: number;
  category: "input" | "model" | "tool" | "output" | "system" | "error";
  name?: string;
  summary?: string;
  eventType: string;
  status: string;
  payload?: unknown;
  result?: unknown;
  eaaAction?: unknown;
  metadata?: { lineage?: Lineage; [key: string]: unknown };
  startedAt: string;
  endedAt?: string;
  createdAt?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  contentHash?: string;
};
type Trajectory = {
  sessionId?: string;
  scopeType?: string;
  scopeId?: string;
  runs: Run[];
  events: Event[];
  cursor?: string;
  incremental?: boolean;
  summary: {
    durationMs?: number;
    eventCount?: number;
    modelCalls?: number;
    toolCalls?: number;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    costUsd?: number;
  };
};

const colors: Record<Event["category"], string> = {
  input: "bg-sky-500",
  model: "bg-violet-500",
  tool: "bg-amber-500",
  output: "bg-emerald-500",
  system: "bg-slate-400",
  error: "bg-red-500",
};
const labels: Record<Event["category"], string> = {
  input: "USER",
  model: "MODEL",
  tool: "TOOL",
  output: "OUTPUT",
  system: "SYSTEM",
  error: "ERROR",
};
const fmt = (value?: number) =>
  value == null
    ? "—"
    : value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : String(value);
const ms = (value?: number) =>
  value == null
    ? "—"
    : value >= 1000
      ? `${(value / 1000).toFixed(1)}s`
      : `${Math.round(value)}ms`;

type TrajectoryViewProps =
  | { sessionId: string; scopeType?: never; scopeId?: never }
  | { sessionId?: never; scopeType: string; scopeId: string };

export function TrajectoryView({
  sessionId,
  scopeType,
  scopeId,
}: TrajectoryViewProps) {
  const [data, setData] = useState<Trajectory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Event | null>(null);
  const [query, setQuery] = useState("");
  const [detailMode, setDetailMode] = useState<"simple" | "expert">("simple");
  const cursor = useRef<string | undefined>(undefined);
  const load = useCallback(async () => {
    const supportsIncremental = Boolean(sessionId);
    const suffix = supportsIncremental && cursor.current
      ? `?since=${encodeURIComponent(cursor.current)}`
      : "";
    const endpoint = sessionId
      ? `/api/provenance/sessions/${encodeURIComponent(sessionId)}`
      : `/api/provenance/scopes/${encodeURIComponent(scopeType!)}/${encodeURIComponent(scopeId!)}`;
    const response = await fetch(
      `${endpoint}${suffix}`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(body.error || "Could not load provenance");
    setData((current) => {
      if (!current || !body.data.incremental) return body.data;
      const byId = new Map(
        current.events.map((event) => [event.eventId, event]),
      );
      for (const event of body.data.events ?? [])
        byId.set(event.eventId, event);
      const events = [...byId.values()].sort(
        (left, right) =>
          new Date(left.startedAt).getTime() -
            new Date(right.startedAt).getTime() ||
          left.sequence - right.sequence,
      );
      const runs = body.data.runs ?? current.runs;
      return {
        ...body.data,
        events,
        runs,
        summary: {
          durationMs: runs.reduce(
            (total: number, run: Run) => total + (run.durationMs ?? 0),
            0,
          ),
          eventCount: events.length,
          modelCalls: events.filter((event) => event.category === "model")
            .length,
          toolCalls: events.filter((event) => event.category === "tool").length,
          inputTokens: runs.reduce(
            (total: number, run: Run) => total + (run.inputTokens ?? 0),
            0,
          ),
          outputTokens: runs.reduce(
            (total: number, run: Run) => total + (run.outputTokens ?? 0),
            0,
          ),
          cachedTokens: runs.reduce(
            (total: number, run: Run) => total + (run.cachedTokens ?? 0),
            0,
          ),
          costUsd: runs.reduce(
            (total: number, run: Run) => total + Number(run.costUsd ?? 0),
            0,
          ),
        },
      };
    });
    if (supportsIncremental)
      cursor.current = body.data.cursor ?? cursor.current;
    setError(null);
  }, [scopeId, scopeType, sessionId]);
  useEffect(() => {
    cursor.current = undefined;
    setData(null);
    setSelected(null);
    setError(null);
    void load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (!data?.runs.some((run) => run.status === "running")) return;
    const id = window.setInterval(
      () => void load().catch(() => undefined),
      1500,
    );
    return () => window.clearInterval(id);
  }, [data?.runs, load]);
  const events = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return !needle
      ? (data?.events ?? [])
      : (data?.events ?? []).filter((event) =>
          `${event.name} ${event.summary} ${event.eventType} ${event.category}`
            .toLowerCase()
            .includes(needle),
        );
  }, [data?.events, query]);
  const bounds = useMemo(() => {
    const starts = (data?.events ?? []).map((event) =>
      new Date(event.startedAt).getTime(),
    );
    const ends = (data?.events ?? []).map((event) =>
      new Date(event.endedAt ?? event.startedAt).getTime(),
    );
    return {
      start: Math.min(...starts),
      span: Math.max(1, Math.max(...ends) - Math.min(...starts)),
    };
  }, [data?.events]);
  if (!data && !error)
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading provenance…
      </div>
    );
  if (error)
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        <AlertCircle className="mr-2 h-4 w-4" />
        {error}
      </div>
    );
  const summary = data!.summary;
  return (
    <div className="flex h-full min-h-0 bg-page">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" />
            {ms(summary.durationMs)}
          </span>
          <span>
            {data!.runs.length} run{data!.runs.length === 1 ? "" : "s"}
          </span>
          <span>
            {summary.modelCalls ?? 0} model · {summary.toolCalls ?? 0} tool
          </span>
          <span>
            {fmt((summary.inputTokens ?? 0) + (summary.outputTokens ?? 0))}{" "}
            tokens
          </span>
          <span className="inline-flex items-center gap-1">
            <Coins className="h-3.5 w-3.5" />$
            {(summary.costUsd ?? 0).toFixed(4)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {data!.runs[0]?.captureMode ?? "metadata"}
          </span>
          <div
            className="inline-flex rounded-md border border-border bg-background p-0.5"
            aria-label="Provenance detail level"
          >
            <button
              onClick={() => setDetailMode("simple")}
              className={cn(
                "rounded px-2 py-1",
                detailMode === "simple" && "bg-muted text-foreground",
              )}
            >
              Sources
            </button>
            <button
              onClick={() => setDetailMode("expert")}
              className={cn(
                "rounded px-2 py-1",
                detailMode === "expert" && "bg-muted text-foreground",
              )}
            >
              Trajectory
            </button>
          </div>
          <label className="ml-auto flex min-w-48 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
            <Search className="h-3.5 w-3.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search trajectory"
              className="w-full bg-transparent outline-none"
            />
          </label>
        </div>
        {detailMode === "simple" ? (
          <SimpleReport events={data!.events} />
        ) : (
          <>
            {data!.events.length > 0 && (
              <div className="border-b border-border bg-muted/20 px-4 py-3">
                <div className="relative h-14 overflow-hidden rounded-md border border-border/70 bg-background">
                  {data!.events.map((event) => {
                    const start =
                      ((new Date(event.startedAt).getTime() - bounds.start) /
                        bounds.span) *
                      100;
                    const width = Math.max(
                      0.8,
                      ((new Date(event.endedAt ?? event.startedAt).getTime() -
                        new Date(event.startedAt).getTime()) /
                        bounds.span) *
                        100,
                    );
                    const row =
                      event.category === "tool"
                        ? 34
                        : event.category === "model"
                          ? 18
                          : 2;
                    return (
                      <button
                        key={event.eventId}
                        title={event.name ?? event.eventType}
                        onClick={() => setSelected(event)}
                        className={cn(
                          "absolute h-3 rounded-sm opacity-85 transition-opacity hover:opacity-100",
                          colors[event.category],
                        )}
                        style={{
                          left: `${Math.min(start, 99)}%`,
                          width: `${Math.min(width, 100 - start)}%`,
                          top: row,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Database className="h-6 w-6" />
                  <span>
                    {data!.events.length
                      ? "No matching events"
                      : "No provenance events yet"}
                  </span>
                  <span className="max-w-sm text-xs">
                    New runs record metadata by default. Raw prompts and outputs
                    require explicit full-capture mode.
                  </span>
                </div>
              ) : (
                events.map((event) => (
                  <button
                    key={event.eventId}
                    onClick={() => setSelected(event)}
                    className={cn(
                      "grid w-full grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-muted/40",
                      selected?.eventId === event.eventId && "bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold text-white",
                        colors[event.category],
                      )}
                    >
                      {labels[event.category]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {event.name ?? event.eventType}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {event.summary ?? event.eventType}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {ms(event.durationMs)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
      {detailMode === "expert" && selected && (
        <aside className="hidden w-[40%] max-w-xl min-w-80 border-l border-border bg-background lg:flex lg:flex-col">
          <div className="flex items-center border-b border-border px-4 py-3">
            <span
              className={cn(
                "mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white",
                colors[selected.category],
              )}
            >
              {labels[selected.category]}
            </span>
            <span className="truncate text-sm font-medium">
              {selected.name ?? selected.eventType}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </div>
          <div className="space-y-5 overflow-y-auto p-4 text-xs">
            <section>
              <h3 className="mb-2 font-semibold">Summary</h3>
              <dl className="grid grid-cols-[6rem_1fr] gap-2 text-muted-foreground">
                <dt>Status</dt>
                <dd className="text-foreground">{selected.status}</dd>
                <dt>Event</dt>
                <dd className="text-foreground">{selected.eventType}</dd>
                <dt>Duration</dt>
                <dd className="text-foreground">{ms(selected.durationMs)}</dd>
                <dt>Tokens</dt>
                <dd className="text-foreground">
                  {fmt(
                    (selected.inputTokens ?? 0) + (selected.outputTokens ?? 0),
                  )}
                </dd>
                <dt>Hash</dt>
                <dd className="break-all font-mono text-foreground">
                  {selected.contentHash ?? "—"}
                </dd>
              </dl>
            </section>
            {selected.payload != null && (
              <Json title="Payload" value={selected.payload} />
            )}
            {selected.result != null && (
              <Json title="Result" value={selected.result} />
            )}
            <Json title="EAA action" value={selected.eaaAction} />
          </div>
        </aside>
      )}
    </div>
  );
}

function SimpleReport({ events }: { events: Event[] }) {
  const searches = events.filter(
    (event) => event.metadata?.lineage?.kind === "web_search",
  );
  const sources = searches.flatMap((event) =>
    (event.metadata?.lineage?.sources ?? []).map((source) => ({
      ...source,
      query: event.metadata?.lineage?.query?.text,
      provider: event.metadata?.lineage?.tool?.provider,
    })),
  );
  const delegations = events.flatMap((event) =>
    event.metadata?.lineage?.delegation
      ? [event.metadata.lineage.delegation]
      : [],
  );
  const libraryMatches = events.flatMap((event) =>
    (event.metadata?.lineage?.library?.results ?? []).map((result) => ({
      ...result,
      embedding: event.metadata?.lineage?.library?.embedding,
    })),
  );
  const decisions = events.flatMap((event) =>
    event.metadata?.lineage?.decision
      ? [
          {
            ...event.metadata.lineage.decision,
            workflow: event.metadata.lineage.workflow,
          },
        ]
      : [],
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h2 className="text-base font-semibold">Sources & contributors</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A plain-language record of where information came from and how this
            result was produced.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            icon={<ExternalLink className="h-4 w-4" />}
            label="Web sources"
            value={sources.length}
          />
          <Metric
            icon={<Users className="h-4 w-4" />}
            label="Agent contributions"
            value={delegations.length}
          />
          <Metric
            icon={<Library className="h-4 w-4" />}
            label="Library matches"
            value={libraryMatches.length}
          />
        </div>
        <ReportSection
          title="Web research"
          empty="No web sources were used in this session."
        >
          {sources.map((source, index) => (
            <a
              key={`${source.url}-${index}`}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-border bg-background p-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600">
                  {source.rank ?? index + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {source.title ?? source.domain}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {source.domain} · {source.provider ?? "web search"}
                  </div>
                  {source.query && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Search: “{source.query}”
                    </div>
                  )}
                </div>
                <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
            </a>
          ))}
        </ReportSection>
        <ReportSection
          title="Agent & workflow contributions"
          empty="No delegated agents or workflow decisions were recorded."
        >
          {delegations.map((item, index) => (
            <div
              key={index}
              className="rounded-lg border border-border p-3 text-sm"
            >
              <span className="font-medium">{item.toAgentId ?? "Agent"}</span>
              <span className="text-muted-foreground">
                {" "}
                contributed as {item.role ?? "specialist"}
                {item.architecture ? ` in a ${item.architecture} workflow` : ""}
              </span>
            </div>
          ))}
          {decisions.map((item, index) => (
            <div
              key={`decision-${index}`}
              className="rounded-lg border border-border p-3 text-sm"
            >
              <span className="font-medium">
                {item.type === "human_approval"
                  ? `Human review: ${String(item.outcome)}`
                  : `Decision: ${String(item.outcome)}`}
              </span>
              <span className="block text-xs text-muted-foreground">
                {item.approval?.reviewerId
                  ? `${item.approval.reviewerType ?? "human"} ${item.approval.reviewerId}`
                  : (item.rule ?? item.type)}
                {item.workflow?.nodeId ? ` · node ${item.workflow.nodeId}` : ""}
              </span>
              {item.approval?.prompt && (
                <span className="mt-1 block text-xs">
                  {item.approval.prompt}
                </span>
              )}
              {item.approval?.reason && (
                <span className="mt-1 block text-xs text-destructive">
                  Reason: {item.approval.reason}
                </span>
              )}
              {item.approval?.note && (
                <span className="mt-1 block text-xs">
                  Review note: {item.approval.note}
                </span>
              )}
            </div>
          ))}
        </ReportSection>
        <ReportSection
          title="Library attribution & similarity"
          empty="No library items were retrieved."
        >
          {libraryMatches.map((item, index) => (
            <div
              key={`${item.itemId}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {item.name ?? item.itemId}
                </div>
                <div className="text-xs text-muted-foreground">
                  Match #{item.rank ?? index + 1}
                  {item.embeddingModel || item.embedding?.model
                    ? ` · ${item.embeddingModel ?? item.embedding?.model}`
                    : ""}
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600">
                {item.percentageMatch ?? 0}% match
              </span>
            </div>
          ))}
        </ReportSection>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
function ReportSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const visible = items.some(Boolean);
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-2">
        {visible ? (
          children
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

function Json({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[11px] leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
