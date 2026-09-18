"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bot, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid, Input, Select, Switch, SwitchRow, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState, List, ListRow } from "@/components/ui/surface";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/toast-provider";
import type {
  CourseAgentAction,
  CourseAgentConfig,
  CourseAgentDataScope,
} from "@/types/course-agent";
import type { CourseViewProps } from "./types";

const audienceLabels: Record<CourseAgentConfig["audience"], string> = {
  learners: "Learners",
  educators: "Educators",
  both: "Learners and educators",
};

const scopeLabels: Record<CourseAgentDataScope, string> = {
  course_overview: "Course overview",
  course_content: "Course content",
  course_content_and_progress: "Content and own progress",
  educator_operations: "Educator operations",
};

const modeLabels: Record<CourseAgentConfig["learningMode"], string> = {
  socratic: "Socratic",
  guided: "Guided",
  direct_support: "Direct support",
};

const actionOptions: Array<{ value: CourseAgentAction; label: string; description: string }> = [
  { value: "suggest", label: "Suggest", description: "Offer next steps and ideas." },
  { value: "draft", label: "Draft", description: "Write drafts the user can review." },
  { value: "fill_view", label: "Fill forms", description: "Fill in fields on the current view." },
  { value: "navigate", label: "Navigate", description: "Move the user to another page." },
];

type AgentTab = "setup" | "instructions" | "permissions" | "connection";

function useAgentParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agent");
  const open = useCallback(
    (id: string | null) => {
      router.replace(id ? `${pathname}?agent=${encodeURIComponent(id)}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  return [agentId, open] as const;
}

/**
 * Course agents follow the Agent Commons pattern: a quiet list of agents,
 * and a focused page for one agent at a time.
 */
export function AgentsView({
  course,
  setCourse,
  courseSlug,
}: Pick<CourseViewProps, "course" | "setCourse"> & { courseSlug?: string }) {
  const [agentId, openAgent] = useAgentParam();
  const agents = course.agents;
  const index = agents.findIndex((agent) => agent.id === agentId);
  const agent = index >= 0 ? agents[index] : null;
  const { toast } = useToast();

  const setAgents = (next: CourseAgentConfig[]) => setCourse((current) => ({ ...current, agents: next }));

  function addAgent() {
    const id = `course-agent-${Date.now().toString(36)}`;
    setAgents([
      ...agents,
      {
        id,
        name: `Course agent ${agents.length + 1}`,
        audience: "learners",
        enabled: true,
        dataScope: "course_content",
        learningMode: "guided",
        actions: ["suggest"],
        instructions: "",
      },
    ]);
    openAgent(id);
    toast({ title: "Agent added", description: "Save to apply this change.", tone: "info" });
  }

  if (agent) {
    return (
      <AgentDetail
        key={agent.id}
        agent={agent}
        courseSlug={courseSlug}
        onBack={() => openAgent(null)}
        onChange={(next) => setAgents(agents.map((item, i) => (i === index ? next : item)))}
        onRemove={() => {
          if (!window.confirm(`Remove ${agent.name}?`)) return;
          setAgents(agents.filter((_, i) => i !== index));
          openAgent(null);
          toast({ title: "Agent removed", description: "Save to apply this change.", tone: "info" });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {agents.length} agent{agents.length === 1 ? "" : "s"}
        </p>
        <Button variant="primary" icon={Plus} onClick={addAgent}>
          New agent
        </Button>
      </div>
      {agents.length ? (
        <List>
          {agents.map((item) => (
            <ListRow
              key={item.id}
              onClick={() => openAgent(item.id)}
              leading={<AgentAvatar name={item.name} enabled={item.enabled} />}
              title={item.name}
              meta={`${audienceLabels[item.audience]} · ${scopeLabels[item.dataScope]}`}
              trailing={
                <>
                  {item.agentCommonsAgentId ? <Badge tone="info">Connected</Badge> : null}
                  <Badge tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "On" : "Off"}</Badge>
                </>
              }
            />
          ))}
        </List>
      ) : (
        <EmptyState
          icon={Bot}
          title="No course agents"
          description="Add an assistant for learners or your teaching team."
          action={
            <Button variant="primary" icon={Plus} onClick={addAgent}>
              New agent
            </Button>
          }
        />
      )}
    </div>
  );
}

function AgentAvatar({ name, enabled }: { name: string; enabled?: boolean }) {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-highlight text-sm font-medium text-stone-900">
      {name.slice(0, 1).toUpperCase() || <Bot className="h-4 w-4" />}
      {enabled !== undefined ? (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${enabled ? "bg-emerald-500" : "bg-stone-300"}`}
        />
      ) : null}
    </span>
  );
}

function AgentDetail({
  agent,
  courseSlug,
  onBack,
  onChange,
  onRemove,
}: {
  agent: CourseAgentConfig;
  courseSlug?: string;
  onBack: () => void;
  onChange: (agent: CourseAgentConfig) => void;
  onRemove: () => void;
}) {
  const [tab, setTab] = useState<AgentTab>("setup");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const patch = (value: Partial<CourseAgentConfig>) => onChange({ ...agent, ...value });

  async function connect() {
    if (!courseSlug || creating) return;
    setCreating(true);
    setError("");
    const res = await fetch(`/api/educator/courses/${courseSlug}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseAgentId: agent.id, agent }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error || "Could not create the Agent Commons agent.");
      return;
    }
    patch({ agentCommonsAgentId: data.agentCommonsAgentId });
    toast({ tone: "success", title: "Agent created", description: `${agent.name} is connected to Agent Commons.` });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All agents
      </button>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AgentAvatar name={agent.name} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-medium tracking-tight">{agent.name}</h2>
          <p className="text-sm text-muted-foreground">{audienceLabels[agent.audience]}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {agent.enabled ? "On" : "Off"}
          <Switch checked={agent.enabled} onChange={(enabled) => patch({ enabled })} label="Agent enabled" />
        </label>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove}>
          Remove
        </Button>
      </div>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "setup", label: "Setup" },
          { value: "instructions", label: "Instructions" },
          { value: "permissions", label: "Permissions" },
          { value: "connection", label: "Connection" },
        ]}
      />

      {tab === "setup" ? (
        <Card>
          <FieldGrid>
            <Field label="Name" className="sm:col-span-2">
              <Input value={agent.name} onChange={(event) => patch({ name: event.target.value })} />
            </Field>
            <Field label="Audience">
              <Select
                value={agent.audience}
                onChange={(event) => patch({ audience: event.target.value as CourseAgentConfig["audience"] })}
              >
                {Object.entries(audienceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Teaching style"
              info="Socratic asks questions, Guided gives hints and structure, Direct support explains plainly."
            >
              <Select
                value={agent.learningMode}
                onChange={(event) =>
                  patch({ learningMode: event.target.value as CourseAgentConfig["learningMode"] })
                }
              >
                {Object.entries(modeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGrid>
        </Card>
      ) : null}

      {tab === "instructions" ? (
        <Card>
          <Field label="Guardrails and instructions" info="How the agent should behave, and what it must not do.">
            <Textarea
              rows={12}
              value={agent.instructions}
              onChange={(event) => patch({ instructions: event.target.value })}
            />
          </Field>
        </Card>
      ) : null}

      {tab === "permissions" ? (
        <div className="space-y-5">
          <Card>
            <Field label="Data access" info="What course information the agent can read.">
              <Select
                value={agent.dataScope}
                onChange={(event) => patch({ dataScope: event.target.value as CourseAgentDataScope })}
              >
                {Object.entries(scopeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
          <Card className="divide-y divide-border py-2">
            {actionOptions.map((action) => (
              <SwitchRow
                key={action.value}
                label={action.label}
                description={action.description}
                checked={agent.actions.includes(action.value)}
                onChange={(checked) =>
                  patch({
                    actions: checked
                      ? Array.from(new Set([...agent.actions, action.value]))
                      : agent.actions.filter((item) => item !== action.value),
                  })
                }
              />
            ))}
          </Card>
        </div>
      ) : null}

      {tab === "connection" ? (
        <Card>
          {agent.agentCommonsAgentId ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="text-sm font-medium">Connected to Agent Commons</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{agent.agentCommonsAgentId}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Not connected</p>
                <p className="text-sm text-muted-foreground">Create a matching agent on Agent Commons.</p>
              </div>
              <Button variant="primary" icon={Bot} loading={creating} disabled={!courseSlug} onClick={connect}>
                Create agent
              </Button>
            </div>
          )}
          {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
