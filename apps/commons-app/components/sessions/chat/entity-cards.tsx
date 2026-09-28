"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppWindow,
  ArrowUpRight,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { AgentAvatar } from "@/components/agents/agent-avatar";

export type EntityKind = "agent" | "task" | "tool" | "skill" | "workflow" | "app" | "knowledge" | "note";

export type EntityRef = {
  key: string;
  kind: EntityKind;
  id?: string;
  name: string;
  /** "created" | "updated" | "proposed" (waiting for the person's review) */
  action: "created" | "updated" | "proposed";
  href?: string;
  /** Whatever the tool returned about the entity, used for the preview. */
  data: Record<string, any>;
};

const ICONS: Record<EntityKind, typeof Bot> = {
  agent: Bot,
  task: Clock,
  tool: Wrench,
  skill: Zap,
  workflow: Workflow,
  app: AppWindow,
  knowledge: Brain,
  note: FileText,
};

const NOUNS: Record<EntityKind, string> = {
  agent: "agent",
  task: "scheduled task",
  tool: "tool",
  skill: "skill",
  workflow: "workflow",
  app: "app",
  knowledge: "Knowledge Space",
  note: "note",
};

function unwrap(value: any): any {
  let current = value;
  if (typeof current === "string") {
    try { current = JSON.parse(current); } catch { return null; }
  }
  if (current && typeof current === "object") {
    if (current.data !== undefined && !current.change && !current.pluginId) return unwrap(current.data);
    if (current.toolData !== undefined) return unwrap(current.toolData);
    if (typeof current.output === "string" && Object.keys(current).length <= 2) return unwrap(current.output);
  }
  return current;
}

function hrefFor(kind: EntityKind, id?: string, data: Record<string, any> = {}) {
  if (!id) return undefined;
  const encoded = encodeURIComponent(id);
  switch (kind) {
    case "agent": return `/studio/agents/${encoded}`;
    case "task": return `/studio/tasks/${encoded}`;
    case "tool": return `/studio/tools/${encoded}`;
    case "skill": return `/studio/customize/skills/${encoded}`;
    case "workflow": return `/studio/workflows/${encoded}`;
    case "app": return data.slug && data.status === "active" ? `/apps/${encodeURIComponent(data.slug)}` : "/studio/customize/apps";
    case "knowledge":
    case "note": return "/knowledge";
  }
}

const TOOL_KINDS: Record<string, EntityKind> = {
  proposeAgentChange: "agent",
  proposeTaskChange: "task",
  proposeSkillChange: "skill",
  proposeToolChange: "tool",
  proposeWorkflowChange: "workflow",
  createTask: "task",
  registerUiPlugin: "app",
  writeKnowledgeDocument: "note",
  local_save_skill: "skill",
  local_create_knowledge_space: "knowledge",
  local_create_note: "note",
  local_register_app: "app",
};

/** Finds the platform items an agent created or changed in one turn. */
export function collectEntityRefs(calls: Array<{ name?: string; toolName?: string; args?: any; result?: any; output?: any; status?: string }>) {
  const refs = new Map<string, EntityRef>();
  for (const call of calls) {
    const tool = call.name ?? call.toolName ?? "";
    const kindFromTool = TOOL_KINDS[tool];
    if (!kindFromTool || call.status === "error" || call.status === "failed") continue;
    const result = unwrap(call.result ?? call.output);
    if (!result || typeof result !== "object" || (typeof result === "string") || /^Error/.test(String(result))) continue;
    const args = call.args ?? {};
    let ref: EntityRef | null = null;
    if (result.change && typeof result.change === "object") {
      const change = result.change;
      const kind = (change.resourceType as EntityKind) || kindFromTool;
      const after = change.after ?? {};
      const id = change.resourceId ?? undefined;
      ref = {
        key: change.changeId ?? `${kind}:${id ?? after.name}`,
        kind,
        id,
        name: after.name ?? after.title ?? change.title ?? NOUNS[kind],
        action: result.requiresConfirmation ? "proposed" : change.action === "update" ? "updated" : "created",
        href: hrefFor(kind, id, after) ?? result.studioUrl,
        data: { ...after, summary: change.title, description: change.description ?? after.description },
      };
    } else if (kindFromTool === "app") {
      const id = result.pluginId ?? result.appId;
      if (!id) continue;
      ref = {
        key: `app:${id}`,
        kind: "app",
        id,
        name: result.name ?? args.name ?? "App",
        action: "created",
        href: tool === "local_register_app" ? "/studio/customize/apps" : hrefFor("app", id, result),
        data: { ...args, ...result, reviewRequired: result.reviewRequired ?? tool !== "local_register_app" },
      };
    } else if (kindFromTool === "task" && result.taskId) {
      ref = { key: `task:${result.taskId}`, kind: "task", id: result.taskId, name: result.title ?? args.title ?? "Task", action: "created", href: hrefFor("task", result.taskId), data: { ...args, ...result } };
    } else if (kindFromTool === "skill" && (result.skillId || result.slug)) {
      const id = result.skillId ?? result.slug;
      ref = { key: `skill:${id}`, kind: "skill", id, name: args.name ?? result.slug ?? "Skill", action: "created", href: hrefFor("skill", id), data: { ...args, ...result } };
    } else if (kindFromTool === "knowledge" && result.spaceId) {
      ref = { key: `knowledge:${result.spaceId}`, kind: "knowledge", id: result.spaceId, name: result.name ?? args.name ?? "Knowledge Space", action: "created", href: "/knowledge", data: { ...args, ...result } };
    } else if (kindFromTool === "note" && (result.documentId || result.path)) {
      const id = result.documentId ?? result.path;
      ref = {
        key: `note:${result.spaceId ?? args.spaceId}:${id}`,
        kind: "note",
        id,
        name: result.title ?? String(result.path ?? args.path ?? "Note").split("/").pop()!.replace(/\.mdx?$/, ""),
        action: args.documentId || (result.revision ?? 1) > 1 ? "updated" : "created",
        href: "/knowledge",
        data: { ...result, content: result.content ?? args.content, path: result.path ?? args.path },
      };
    }
    if (ref) refs.set(ref.key, ref);
  }
  return [...refs.values()];
}

const DETAIL_ENDPOINTS: Partial<Record<EntityKind, (id: string) => string>> = {
  agent: (id) => `/api/agents/${encodeURIComponent(id)}`,
  task: (id) => `/api/tasks/${encodeURIComponent(id)}`,
  tool: (id) => `/api/tools/${encodeURIComponent(id)}`,
  skill: (id) => `/api/skills/${encodeURIComponent(id)}`,
  workflow: (id) => `/api/workflows/${encodeURIComponent(id)}`,
};

/**
 * One line naming what the agent created or changed. Expanding it shows a
 * compact preview shaped like the item's own page; Open goes there in-app.
 */
export function EntityCard({ entity }: { entity: EntityRef }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const Icon = ICONS[entity.kind];
  const verb = entity.action === "proposed" ? "Proposed" : entity.action === "updated" ? "Updated" : "Created";

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    const endpoint = entity.id && entity.action !== "proposed" ? DETAIL_ENDPOINTS[entity.kind]?.(entity.id) : undefined;
    if (next && endpoint && !detail) {
      setLoading(true);
      try {
        const response = await desktopApiFetch(endpoint, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (response.ok) setDetail(payload?.data ?? payload);
      } finally {
        setLoading(false);
      }
    }
  };

  const data = { ...entity.data, ...(detail ?? {}) };

  return (
    <div className="not-prose my-2 w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => void toggle()} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="min-w-0 truncate text-[13px]">
            <span className="text-muted-foreground">{verb} {NOUNS[entity.kind]} · </span>
            <span className="font-medium text-foreground">{entity.name}</span>
          </span>
          {entity.action === "proposed" && (
            <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Needs review</span>
          )}
          {loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" /> : open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </button>
        {entity.href && (
          <button
            type="button"
            onClick={() => router.push(entity.href!)}
            className="flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {entity.action === "proposed" ? "Review" : "Open"}
            <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && (
        <div className="max-h-72 overflow-y-auto border-t border-border/70 bg-page/60 px-4 py-3">
          <EntityPreview kind={entity.kind} name={entity.name} data={data} />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-foreground/80">{children}</span>
    </div>
  );
}

function Excerpt({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/75">{text.length > 1_200 ? `${text.slice(0, 1_200)}…` : text}</p>;
}

function schedule(data: Record<string, any>) {
  if (data.cronExpression) return data.isRecurring === false ? data.cronExpression : `Repeats · ${data.cronExpression}`;
  const when = data.scheduledFor ?? data.dueAt;
  return when ? new Date(when).toLocaleString() : undefined;
}

function EntityPreview({ kind, name, data }: { kind: EntityKind; name: string; data: Record<string, any> }) {
  if (kind === "agent") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <AgentAvatar name={data.name ?? name} src={data.avatar} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{data.name ?? name}</p>
            <p className="truncate text-xs text-muted-foreground">{[data.modelProvider, data.modelId].filter(Boolean).join(" · ") || "Agent"}</p>
          </div>
        </div>
        <Excerpt text={data.description ?? data.persona} />
        {data.instructions && (
          <div className="rounded-lg border border-border bg-background p-2.5">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Instructions</p>
            <Excerpt text={data.instructions} />
          </div>
        )}
      </div>
    );
  }
  if (kind === "task") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{data.title ?? name}</p>
        <Field label="When">{schedule(data)}</Field>
        <Field label="Status">{data.status}</Field>
        <Field label="Agent">{data.agentName ?? data.agentId}</Field>
        <Excerpt text={data.description ?? data.prompt} />
      </div>
    );
  }
  if (kind === "skill") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-sm font-medium">{data.name ?? name}</p>
        </div>
        <p className="text-xs text-muted-foreground">{data.description}</p>
        {data.instructions && <div className="rounded-lg border border-border bg-background p-2.5"><Excerpt text={data.instructions} /></div>}
      </div>
    );
  }
  if (kind === "tool") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{data.displayName ?? data.name ?? name}</p>
        <p className="text-xs text-muted-foreground">{data.description}</p>
        <Field label="Endpoint">{data.apiSpec?.baseUrl ?? data.endpoint}</Field>
        <Field label="Method">{data.apiSpec?.method ?? data.method}</Field>
      </div>
    );
  }
  if (kind === "workflow") {
    const nodes: any[] = data.definition?.nodes ?? data.nodes ?? [];
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{data.name ?? name}</p>
        <p className="text-xs text-muted-foreground">{data.description}</p>
        {nodes.length > 0 && (
          <ol className="space-y-1">
            {nodes.slice(0, 12).map((node, index) => (
              <li key={node.id ?? index} className="flex items-center gap-2 text-xs">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">{index + 1}</span>
                <span className="truncate">{node.data?.label ?? node.label ?? node.type ?? "Step"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }
  if (kind === "app") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <AppWindow className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-sm font-medium">{data.name ?? name}</p>
        </div>
        <p className="text-xs text-muted-foreground">{data.description ?? (data.reviewRequired ? "Review its access in Customize, then turn it on." : "Ready to open.")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className={cn("text-sm font-medium")}>{name}</p>
      <Field label="Path">{data.path ?? data.folder}</Field>
      <Excerpt text={data.content} />
    </div>
  );
}
