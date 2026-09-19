"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Activity, ArrowLeft, ArrowRight, BookOpen, Bot, Check, ChevronDown,
  CircleAlert, Code2, Copy, ExternalLink, KeyRound, Loader2, Plus,
  RefreshCw, Terminal, UserRound, Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAgents } from "@/hooks/use-agents";
import { DeveloperApiKeysSection } from "@/components/account/developer-api-keys-section";
import { cn } from "@/lib/utils";

type Project = {
  id: string;
  name: string;
  environment: "development" | "staging" | "production";
  status: string;
};
type Key = { id: string; projectId: string; status: string };
type Usage = {
  summary: { requests: number; errors: number; averageLatencyMs: number };
  daily: { day: string; requests: number; errors: number }[];
  recent: {
    requestId: string; method: string; path: string; statusCode: number;
    durationMs: number; createdAt: string;
  }[];
};
type Tab = "overview" | "agents" | "keys" | "usage" | "quickstart";
const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Zap },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "keys", label: "API keys", icon: KeyRound },
  { id: "usage", label: "Usage", icon: Activity },
  { id: "quickstart", label: "Quickstart", icon: Code2 },
];

function message(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const candidate = "error" in body ? body.error : "message" in body ? body.message : null;
    if (typeof candidate === "string") return candidate;
  }
  return fallback;
}

function date(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button type="button" onClick={() => void copy()} aria-label={copied ? "Copied" : label}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ code, title }: { code: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-800 bg-stone-950 text-stone-100">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="font-mono text-[11px] text-stone-400">{title}</span>
        <CopyButton value={code} label="Copy code" />
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-xs leading-6"><code>{code}</code></pre>
    </div>
  );
}

export default function DevelopersPage() {
  const { authState } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageRefresh, setUsageRefresh] = useState(0);
  const [agentId, setAgentId] = useState("");
  const { agents, loading: agentsLoading, error: agentsError, refresh: refreshAgents } = useAgents(authState.userId);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    try {
      const response = await fetch("/api/api-keys", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setSessionExpired(true);
        throw new Error(response.status === 401
          ? "Your session has expired. Sign in again to manage developer resources."
          : message(body, "Could not load developer projects."));
      }
      const next = Array.isArray(body.projects) ? body.projects as Project[] : [];
      setProjects(next);
      setKeys(Array.isArray(body.data) ? body.data : []);
      setProjectId((current) => next.some((p) => p.id === current) ? current : next[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load developer projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => {
    if (!projectId) { setUsage(null); return; }
    let active = true;
    setUsageLoading(true);
    setUsageError(null);
    fetch(`/api/developers/usage?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401 && active) setSessionExpired(true);
          throw new Error(response.status === 401
            ? "Your session has expired. Sign in again to view API usage."
            : message(body, "Could not load API usage."));
        }
        if (active) setUsage(body.data ?? null);
      })
      .catch((cause) => { if (active) { setUsage(null); setUsageError(cause.message); } })
      .finally(() => { if (active) setUsageLoading(false); });
    return () => { active = false; };
  }, [projectId, usageRefresh]);

  const project = projects.find((item) => item.id === projectId);
  const activeKeys = keys.filter((key) => key.projectId === projectId && key.status === "active");
  const selectedAgentId = agentId || agents[0]?.agentId || "YOUR_AGENT_ID";
  const installCode = "npm install @agent-commons/sdk";
  const sdkCode = `import { CommonsClient } from "@agent-commons/sdk";\n\nconst commons = new CommonsClient({\n  apiKey: process.env.AGENT_COMMONS_API_KEY,\n});\n\nconst result = await commons.run.once({\n  agentId: "${selectedAgentId}",\n  messages: [{ role: "user", content: "Hello from my app" }],\n});\n\nconsole.log(result);`;
  const curlCode = `curl https://api.agentcommons.io/v1/agents \\\n  -H "Authorization: Bearer $AGENT_COMMONS_API_KEY"`;
  const daily = useMemo(() => {
    const byDay = new Map((usage?.daily ?? []).map((item) => [item.day.slice(0, 10), item]));
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      day.setUTCDate(day.getUTCDate() - 6 + i);
      const key = day.toISOString().slice(0, 10);
      return byDay.get(key) ?? { day: key, requests: 0, errors: 0 };
    });
  }, [usage]);
  const maxRequests = Math.max(1, ...daily.map((item) => item.requests));

  return (
    <div className="flex h-screen overflow-hidden bg-[#faf9f6] text-stone-950">
      <aside className="hidden w-[238px] shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
        <Link href="/studio/agents" className="flex h-[74px] items-center gap-3 border-b border-stone-100 px-5">
          <Image src="/ac-icon.svg" width={28} height={28} alt="Agent Commons" className="rounded-lg" />
          <span className="text-sm font-semibold tracking-tight">Agent Commons</span>
        </Link>
        <div className="px-4 pt-7">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Build</p>
          <nav className="mt-3 space-y-1" aria-label="Developer console">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => { setTab(id); if (id === "overview") void loadProjects(); }}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition", tab === id ? "bg-stone-900 font-medium text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950")}
                aria-current={tab === id ? "page" : undefined}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />{label}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto space-y-1 border-t border-stone-100 p-4">
          <Link href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"><UserRound className="h-4 w-4" />Account settings</Link>
          <a href="https://docs.agentcommons.io/docs/api" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"><BookOpen className="h-4 w-4" />API reference <ExternalLink className="ml-auto h-3 w-3" /></a>
          <Link href="/studio/agents" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"><ArrowLeft className="h-4 w-4" />Back to Studio</Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex min-h-[74px] flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[#faf9f6]/95 px-5 py-3 backdrop-blur sm:px-9">
          <div className="flex items-center gap-3">
            <Link href="/studio/agents" className="md:hidden" aria-label="Back to Studio"><ArrowLeft className="h-5 w-5" /></Link>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Developer console</p><p className="text-sm font-medium">{tabs.find((item) => item.id === tab)?.label}</p></div>
          </div>
          <div className="flex items-center gap-3">
            {tab !== "keys" && projects.length > 0 && <div className="relative">
              <select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="max-w-[230px] appearance-none rounded-lg border border-stone-200 bg-white py-2 pl-3 pr-8 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-300">
                {projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.environment}</option>)}
              </select><ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-stone-500" />
            </div>}
            <Link href="/settings" className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"><UserRound className="h-4 w-4" />Account</Link>
          </div>
        </header>
        <nav aria-label="Developer console mobile" className="flex gap-1 overflow-x-auto border-b border-stone-200 bg-white px-4 py-2 md:hidden">
          {tabs.map(({ id, label }) => <button key={id} onClick={() => setTab(id)} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-xs", tab === id ? "bg-stone-900 text-white" : "text-stone-600")}>{label}</button>)}
        </nav>
        <div className="mx-auto max-w-[1120px] px-5 py-9 sm:px-9 sm:py-12">
          {error && <div role="alert" className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><CircleAlert className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span>{sessionExpired ? <a href="/api/auth/native/start?direct=1&callbackUrl=%2Fdevelopers" className="shrink-0 font-medium underline">Sign in again</a> : <button onClick={() => void loadProjects()} className="shrink-0 font-medium underline">Retry</button>}</div>}
          {tab === "overview" && <>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Your development workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Build with Commons.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-stone-600">Manage the agents, credentials, and API traffic behind your applications.</p></div>
              <button onClick={() => setTab("quickstart")} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700">Start building <ArrowRight className="h-4 w-4" /></button>
            </div>
            {!loading && !error && !project && <div className="mt-9 rounded-2xl border border-dashed border-stone-300 bg-white p-8"><h2 className="text-lg font-semibold">Create your first project</h2><p className="mt-2 text-sm text-stone-600">A project gives your integration its own credentials and usage history.</p><button onClick={() => setTab("keys")} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"><Plus className="h-4 w-4" />Create project</button></div>}
            {project && <>
              <div className="mt-9 grid gap-3 sm:grid-cols-3">
                <Metric label="API requests · 7 days" value={usageLoading ? "…" : (usage?.summary.requests ?? 0).toLocaleString()} note="Calls made with project credentials" tint="bg-[#e8f1ef]" />
                <Metric label="Workspace agents" value={agentsLoading ? "…" : agents.length.toString()} note="Available to your application" tint="bg-[#f3ede6]" />
                <Metric label="Active API keys" value={activeKeys.length.toString()} note="For this project" tint="bg-[#f1edfa]" />
              </div>
              <div className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
                <div className="rounded-2xl border border-stone-200 bg-white p-6"><div className="flex items-start justify-between"><div><h2 className="text-base font-semibold">API activity</h2><p className="mt-1 text-xs text-stone-500">Requests over the last 7 days</p></div><button onClick={() => setTab("usage")} className="text-xs font-medium text-stone-700 hover:underline">View usage →</button></div><UsageBars daily={daily} max={maxRequests} /><p className="mt-4 text-xs text-stone-500">{usageError ?? `${usage?.summary.errors ?? 0} requests returned an error · ${usage?.summary.averageLatencyMs ?? 0} ms average latency`}</p></div>
                <div className="rounded-2xl border border-stone-200 bg-white p-6"><div className="flex h-full flex-col"><div><h2 className="text-base font-semibold">Get connected</h2><p className="mt-1 text-xs text-stone-500">A short path from key to first request</p></div><div className="mt-6 space-y-4"><Step n="01" title="Create a scoped API key" done={activeKeys.length > 0} onClick={() => setTab("keys")} /><Step n="02" title="Choose an agent" done={agents.length > 0} onClick={() => setTab("agents")} /><Step n="03" title="Run it from your code" done={false} onClick={() => setTab("quickstart")} /></div></div></div>
              </div>
            </>}
          </>}

          {tab === "agents" && <>
            <SectionTitle eyebrow="Your workspace" title="Agents" description="Agents you own are available through the SDK and REST API. Open one in Studio to edit its model, instructions, and tools." action={<Link href="/studio/agents/create" className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm text-white hover:bg-stone-700"><Plus className="h-4 w-4" />Create agent</Link>} />
            {agentsError && <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{agentsError} <button onClick={() => void refreshAgents()} className="ml-2 underline">Retry</button></p>}
            {agentsLoading ? <Loader2 className="mt-10 h-5 w-5 animate-spin text-stone-500" /> : agents.length === 0 ? <Empty title="No agents yet" text="Create an agent in Studio, then use its ID from your own codebase." action="Create agent" href="/studio/agents/create" /> : <div className="mt-7 overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {agents.map((agent) => <div key={agent.agentId} className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-4 last:border-0 sm:gap-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e9e8fa]"><Bot className="h-5 w-5 text-stone-700" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{agent.name}</p><p className="mt-0.5 truncate font-mono text-[11px] text-stone-500">{agent.agentId}</p></div><CopyButton value={agent.agentId} label="Copy ID" /><Link href={`/studio/agents/${encodeURIComponent(agent.agentId)}`} className="inline-flex items-center gap-1 text-xs font-medium hover:underline">Manage <ArrowRight className="h-3.5 w-3.5" /></Link></div>)}
            </div>}
          </>}

          {tab === "keys" && <><SectionTitle eyebrow="Credentials" title="API keys & projects" description="Create separate projects for development, staging, and production. Keys are shown once and can be revoked at any time." />{!sessionExpired && <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7"><DeveloperApiKeysSection workspaceId={authState.workspaceId} onChanged={() => void loadProjects()} /></div>}<div className="mt-5 rounded-xl border border-stone-200 bg-white p-4 text-xs leading-5 text-stone-600">Keep API keys in server side environment variables. Choose only the scopes your integration needs. Project credentials grant access to workspace resources; projects do not create separate agent inventories.</div></>}

          {tab === "usage" && <><SectionTitle eyebrow="Observability" title="API usage" description="Request telemetry for your selected project. Events can take a moment to appear after an API call." action={<button onClick={() => setUsageRefresh((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs hover:bg-stone-50"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>} />
            {sessionExpired ? null : !project ? <Empty title="Select a project" text="Create a developer project to see its API traffic." action="Manage projects" onClick={() => setTab("keys")} /> : usageError ? <div role="alert" className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{usageError}</div> : usageLoading ? <Loader2 className="mt-10 h-5 w-5 animate-spin" /> : <><div className="mt-8 grid gap-3 sm:grid-cols-3"><Metric label="Requests · 7 days" value={(usage?.summary.requests ?? 0).toLocaleString()} note="All response codes" tint="bg-[#e8f1ef]" /><Metric label="Errors · 7 days" value={(usage?.summary.errors ?? 0).toLocaleString()} note="HTTP 4xx and 5xx" tint="bg-[#f8eae8]" /><Metric label="Average latency" value={`${usage?.summary.averageLatencyMs ?? 0} ms`} note="Gateway to upstream response" tint="bg-[#f1edfa]" /></div><div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6"><h2 className="text-sm font-semibold">Daily requests</h2><UsageBars daily={daily} max={maxRequests} /></div><div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white"><div className="border-b border-stone-100 px-5 py-4 text-sm font-semibold">Recent requests</div>{!usage?.recent.length ? <p className="p-6 text-sm text-stone-500">No requests for this project yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-stone-50 text-stone-500"><tr><th className="px-5 py-3 font-medium">Request</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Latency</th><th className="px-5 py-3 font-medium">Time</th></tr></thead><tbody>{usage.recent.map((event) => <tr key={event.requestId} className="border-t border-stone-100"><td className="max-w-[400px] truncate px-5 py-3 font-mono"><span className="mr-2 font-semibold">{event.method}</span>{event.path}</td><td className={cn("px-5 py-3 font-medium", event.statusCode >= 400 ? "text-red-600" : "text-emerald-700")}>{event.statusCode}</td><td className="px-5 py-3">{event.durationMs} ms</td><td className="whitespace-nowrap px-5 py-3 text-stone-500">{date(event.createdAt)}</td></tr>)}</tbody></table></div>}</div></>}
          </>}

          {tab === "quickstart" && <><SectionTitle eyebrow="Integration" title="Your first API call" description="Use a project API key from a trusted server to call a workspace agent. The SDK uses the public Commons API by default." /><div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]"><div className="space-y-6"><div><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">1</span>Create a key</h2><p className="mb-3 text-xs leading-5 text-stone-600">Create a key with <code>agents:read</code> and <code>agents:run</code> scopes, then save it as <code>AGENT_COMMONS_API_KEY</code> on your server.</p><button onClick={() => setTab("keys")} className="text-xs font-semibold underline underline-offset-4">Manage API keys →</button></div><div><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">2</span>Install the SDK</h2><CodeBlock code={installCode} title="terminal" /></div><div><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">3</span>Run an agent</h2>{agents.length > 0 && <select aria-label="Agent for code example" value={agentId || agents[0].agentId} onChange={(event) => setAgentId(event.target.value)} className="mb-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">{agents.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name}</option>)}</select>}<CodeBlock code={sdkCode} title="app.ts" /></div><div><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Terminal className="h-5 w-5" />Prefer HTTP?</h2><CodeBlock code={curlCode} title="terminal" /></div></div><aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5"><p className="text-sm font-semibold">Connection details</p><dl className="mt-5 space-y-4 text-xs"><div><dt className="text-stone-500">API base URL</dt><dd className="mt-1 break-all font-mono">https://api.agentcommons.io</dd></div><div><dt className="text-stone-500">Authentication</dt><dd className="mt-1 font-mono">Bearer csk_...</dd></div><div><dt className="text-stone-500">Selected project</dt><dd className="mt-1 break-all font-mono">{project?.id ?? "Create a project"}</dd></div></dl><a href="https://docs.agentcommons.io/docs/sdk" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1 text-xs font-semibold hover:underline">SDK documentation <ExternalLink className="h-3 w-3" /></a></aside></div></>}
        </div>
      </main>
    </div>
  );
}

function SectionTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{description}</p></div>{action}</div>;
}
function Metric({ label, value, note, tint }: { label: string; value: string; note: string; tint: string }) {
  return <div className="rounded-2xl border border-stone-200 bg-white p-5"><div className={cn("mb-5 h-1.5 w-12 rounded-full", tint)} /><p className="text-xs font-medium text-stone-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-stone-400">{note}</p></div>;
}
function UsageBars({ daily, max }: { daily: Usage["daily"]; max: number }) {
  return <div className="mt-7 grid h-36 grid-cols-7 items-end gap-3" role="img" aria-label={`Requests by day: ${daily.map((d) => `${d.day}: ${d.requests}`).join(", ")}`}>{daily.map((item) => <div key={item.day} className="flex h-full flex-col items-center justify-end gap-2"><div title={`${item.requests} requests on ${item.day}`} className="w-full max-w-10 rounded-t-md bg-[#b8cfc8]" style={{ height: `${Math.max(item.requests ? 8 : 2, (item.requests / max) * 100)}%` }} /><span className="text-[10px] text-stone-400">{new Date(`${item.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short" })}</span></div>)}</div>;
}
function Step({ n, title, done, onClick }: { n: string; title: string; done: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 text-left"><span className={cn("flex h-8 w-8 items-center justify-center rounded-full font-mono text-[11px]", done ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600")}>{done ? <Check className="h-4 w-4" /> : n}</span><span className="flex-1 text-xs font-medium">{title}</span><ArrowRight className="h-3.5 w-3.5 text-stone-400" /></button>;
}
function Empty({ title, text, action, href, onClick }: { title: string; text: string; action: string; href?: string; onClick?: () => void }) {
  const className = "mt-8 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-xs font-medium text-white";
  return <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center"><Bot className="mx-auto h-6 w-6 text-stone-400" /><h2 className="mt-4 text-base font-semibold">{title}</h2><p className="mt-2 text-sm text-stone-500">{text}</p>{href ? <Link href={href} className={className}>{action}<ArrowRight className="h-3.5 w-3.5" /></Link> : <button onClick={onClick} className={className}>{action}<ArrowRight className="h-3.5 w-3.5" /></button>}</div>;
}
