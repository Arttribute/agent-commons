"use client";

import { useState } from "react";
import {
  CalendarClock,
  Check,
  Database,
  ExternalLink,
  Hammer,
  Loader2,
  Monitor,
  Play,
  Plus,
  Server,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AgentSandboxComputerTemplate,
  AgentSandboxMemoryTemplate,
  AgentSandboxSkillTemplate,
  AgentSandboxTaskTemplate,
  AgentSandboxToolTemplate,
  AgentSandboxWorkflowTemplate,
} from "@/types/skills";
import type { AgentSandboxConfig } from "@/types/skills";
import type { ReviewResult } from "./types";
import {
  siGmail,
  siGoogledrive,
  siGooglecalendar,
  siGooglesheets,
} from "simple-icons";

export function IdentityPanel({
  agentName,
  systemPrompt,
  placeholders,
  reviewEnabled,
  review,
  reviewing,
  onNameChange,
  onPromptChange,
  onReview,
}: {
  agentName: string;
  systemPrompt: string;
  placeholders?: AgentSandboxConfig["placeholders"];
  reviewEnabled: boolean;
  review?: ReviewResult;
  reviewing: boolean;
  onNameChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onReview: () => void;
}) {
  return (
    <div className="space-y-4" data-sandbox-target="identity">
      <Field
        label="Agent name"
        value={agentName}
        placeholder={placeholders?.agentName || "Study Coach"}
        onChange={onNameChange}
        target="agent-name"
      />
      <label className="block">
        <span className="text-xs font-bold text-slate-600">System prompt</span>
        <textarea
          data-sandbox-target="system-prompt"
          value={systemPrompt}
          placeholder={
            placeholders?.systemPrompt ||
            "You are a helpful agent. Explain your goal, tone, boundaries, and when to use connected tools."
          }
          onChange={(event) => onPromptChange(event.target.value)}
          className="mt-1.5 min-h-40 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400"
        />
      </label>
      {reviewEnabled ? (
        <div data-sandbox-target="review-box">
          <ReviewBox
            result={review}
            loading={reviewing}
            onReview={onReview}
          />
        </div>
      ) : null}
    </div>
  );
}

export function SkillsPanel({
  skills,
  selected,
  skillInstructions,
  placeholder,
  onChange,
  onInstructionChange,
  onAddSkill,
  reviewEnabled,
  review,
  reviewing,
  onReview,
}: {
  skills: AgentSandboxSkillTemplate[];
  selected: string[];
  skillInstructions: Record<string, string>;
  placeholder?: string;
  onChange: (items: string[]) => void;
  onInstructionChange: (id: string, value: string) => void;
  onAddSkill: (value: string) => void;
  reviewEnabled: boolean;
  review?: ReviewResult;
  reviewing: boolean;
  onReview: () => void;
}) {
  const [draft, setDraft] = useState("");
  const selectedId = selected[0] || "";
  const knownIds = new Set(skills.map((skill) => skill.id));
  const selectedSkill =
    skills.find((skill) => skill.id === selectedId) ||
    (selectedId
      ? {
          id: selectedId,
          name: customSkillTitle(skillInstructions[selectedId]),
          instructions: skillInstructions[selectedId] || "",
        }
      : undefined);
  const listItems = [
    ...skills,
    ...selected
      .filter((id) => !knownIds.has(id))
      .map((id) => ({
        id,
        name: customSkillTitle(skillInstructions[id]),
        instructions: skillInstructions[id] || "",
      })),
  ];

  return (
    <div className="space-y-3" data-sandbox-target="skills">
      {listItems.length ? (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
          {listItems.map((skill) => {
            const active = skill.id === selectedId;
            const description = skillInstructions[skill.id] || skill.instructions;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => onChange(active ? [] : [skill.id])}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-slate-50 border-l-2 border-l-slate-900"
                    : "bg-white hover:bg-slate-50 border-l-2 border-l-transparent"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-bold", active ? "text-slate-900" : "text-slate-800")}>
                    {skill.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {oneLine(description) || "No description yet."}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    active ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
                  )}
                >
                  {active ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {selectedSkill ? (
        <label className="block">
          <span className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
            <span className="truncate">{selectedSkill.name}</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </span>
          <textarea
            data-sandbox-target="skill-instructions"
            value={skillInstructions[selectedSkill.id] || selectedSkill.instructions}
            placeholder={placeholder || "Write the steps this agent should follow..."}
            onChange={(event) =>
              onInstructionChange(selectedSkill.id, event.target.value)
            }
            className="mt-1.5 min-h-44 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400"
          />
        </label>
      ) : (
        <div>
          <textarea
            data-sandbox-target="skill-instructions"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder || "Describe a skill this agent should use..."}
            className="min-h-32 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
          <button
            type="button"
            onClick={() => {
              onAddSkill(draft);
              setDraft("");
            }}
            disabled={!draft.trim()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Plus className="h-3.5 w-3.5" />
            Add skill
          </button>
        </div>
      )}
      {reviewEnabled ? (
        <ReviewBox result={review} loading={reviewing} onReview={onReview} />
      ) : null}
    </div>
  );
}

export function ToolsPanel({
  tools,
  selected,
  onChange,
  googleConnectUrl,
}: {
  tools: AgentSandboxToolTemplate[];
  selected: string[];
  onChange: (items: string[]) => void;
  googleConnectUrl: string;
}) {
  const hasSelectedGoogleTool = tools.some(
    (tool) => selected.includes(tool.id) && isGoogleTool(tool)
  );

  return (
    <div className="space-y-3" data-sandbox-target="tools">
      {tools.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          No tools configured for this lesson.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
          {tools.map((tool) => {
            const checked = selected.includes(tool.id);
            const isGoogle = isGoogleTool(tool);
            return (
              <div
                key={tool.id}
                data-sandbox-target={
                  tool.id === "google-calendar" ||
                  tool.connectorKind === "google_calendar"
                    ? "tool-google-calendar"
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== tool.id)
                        : [...selected, tool.id]
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                    checked ? "bg-slate-50" : "bg-white hover:bg-slate-50"
                  )}
                >
                  <WorkspaceIcon kind={tool.connectorKind} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">
                      {tool.name}
                    </span>
                    {tool.description ? (
                      <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                        {tool.description}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      checked
                        ? "border-slate-900 bg-slate-900"
                        : "border-slate-300 bg-white"
                    )}
                  >
                    {checked ? (
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    ) : null}
                  </span>
                </button>

                {/* Inline connect panel — shown when this Google tool is selected */}
                {checked && isGoogle ? (
                  <div
                    className="border-t border-slate-100 bg-white px-4 py-3"
                    data-sandbox-target="connect-google"
                  >
                    <p className="mb-2.5 text-xs leading-5 text-slate-500">
                      Connect your Google account to give this agent real access to{" "}
                      <span className="font-semibold text-slate-700">{tool.name}</span>.
                    </p>
                    <a
                      href={scopedGoogleConnectUrl(googleConnectUrl, tool)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      <GoogleColorLogo className="h-3.5 w-3.5" />
                      Connect {tool.name}
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback connect link when no Google tool is selected */}
      {!hasSelectedGoogleTool ? (
        <div data-sandbox-target="connect-google">
          <a
            href={googleConnectUrl}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <GoogleColorLogo className="h-4 w-4" />
            Connect Google Workspace
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function TasksPanel({
  tasks,
  selected,
  onChange,
}: {
  tasks: AgentSandboxTaskTemplate[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-3" data-sandbox-target="tasks">
      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          No scheduled tasks configured for this lesson.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {tasks.map((task) => {
            const checked = selected.includes(task.id);
            return (
              <button
                key={task.id}
                type="button"
                data-sandbox-target={`task-${task.id}`}
                onClick={() =>
                  onChange(
                    checked
                      ? selected.filter((id) => id !== task.id)
                      : [...selected, task.id]
                  )
                }
                className={cn(
                  "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
                  checked ? "bg-slate-50" : "bg-white hover:bg-slate-50"
                )}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">
                    {task.title}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                    {task.schedule}
                  </span>
                  {task.description ? (
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {task.description}
                    </span>
                  ) : null}
                </span>
                <CheckCircle checked={checked} />
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs leading-5 text-slate-500">
        Scheduled tasks are instructions that tell the agent when a routine
        should run. This sandbox records the design without starting a real
        background job.
      </p>
    </div>
  );
}

export function WorkflowPanel({
  workflows,
  selectedId,
  result,
  onSelect,
  onRun,
}: {
  workflows: AgentSandboxWorkflowTemplate[];
  selectedId?: string;
  result: string[];
  onSelect: (id: string) => void;
  onRun: () => void;
}) {
  const selected = workflows.find((workflow) => workflow.id === selectedId) || workflows[0];

  return (
    <div className="space-y-3" data-sandbox-target="workflows">
      {workflows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          No workflow configured for this lesson.
        </p>
      ) : (
        <>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {workflows.map((workflow) => {
              const active = workflow.id === selected?.id;
              return (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => onSelect(workflow.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left",
                    active ? "bg-slate-50" : "bg-white hover:bg-slate-50"
                  )}
                >
                  <Workflow className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {workflow.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      Trigger: {workflow.trigger}
                    </span>
                  </span>
                  <CheckCircle checked={active} />
                </button>
              );
            })}
          </div>
          {selected ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Workflow components
              </p>
              {selected.description ? (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selected.description}
                </p>
              ) : null}
              <div className="mt-3 space-y-2">
                <ComponentRow label="Trigger" value={selected.trigger} tone="rose" />
                {selected.nodes.map((node, index) => (
                  <ComponentRow
                    key={`${node}-${index}`}
                    label={`Node ${index + 1}`}
                    value={node}
                    tone="lime"
                  />
                ))}
                {selected.edges.map((edge, index) => (
                  <ComponentRow
                    key={`${edge}-${index}`}
                    label={`Edge ${index + 1}`}
                    value={edge}
                    tone="amber"
                  />
                ))}
              </div>
              <button
                type="button"
                data-sandbox-target="workflow-run"
                onClick={onRun}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
              >
                <Play className="h-3.5 w-3.5" />
                Run simulation
              </button>
            </div>
          ) : null}
          {result.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
              {result.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function MemoryPanel({
  memories,
  entries,
  onChange,
}: {
  memories: AgentSandboxMemoryTemplate[];
  entries: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div className="space-y-3" data-sandbox-target="memory">
      {memories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          No memory records configured for this lesson.
        </p>
      ) : (
        memories.map((memory) => (
          <label
            key={memory.id}
            data-sandbox-target={`memory-${memory.type}`}
            className="block rounded-xl border border-slate-200 bg-white p-3"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                <Database className="h-4 w-4 text-slate-500" />
                {memory.label}
              </span>
              <span className={memoryBadgeClass(memory.type)}>
                {memory.type} memory
              </span>
            </span>
            <textarea
              value={entries[memory.id] ?? memory.content}
              onChange={(event) => onChange(memory.id, event.target.value)}
              className="mt-3 min-h-24 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400"
            />
          </label>
        ))
      )}
    </div>
  );
}

export function ComputerPanel({
  template,
  command,
  output,
  onCommandChange,
  onRun,
}: {
  template?: AgentSandboxComputerTemplate;
  command: string;
  output: string;
  onCommandChange: (value: string) => void;
  onRun: () => void;
}) {
  const files = template?.files || [];

  return (
    <div className="space-y-3" data-sandbox-target="computer">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Monitor className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">
              {template?.workspaceName || "Sandbox workspace"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {template?.isolationMode ||
                "A scoped workspace for safe, lightweight practice."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start gap-2">
          <Server className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Lightweight runtime
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              This environment behaves like a small isolated code workspace. Try{" "}
              <span className="font-mono font-semibold text-slate-900">ls</span>,{" "}
              <span className="font-mono font-semibold text-slate-900">
                cat team-plan.json
              </span>,{" "}
              <span className="font-mono font-semibold text-slate-900">pwd</span>, or{" "}
              <span className="font-mono font-semibold text-slate-900">run team</span>.
            </p>
          </div>
        </div>
      </div>

      {files.length ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {files.map((file) => (
            <details key={file.path} className="border-b border-slate-100 last:border-b-0">
              <summary className="cursor-pointer bg-white px-3 py-2 text-sm font-bold text-slate-800">
                {file.path}
              </summary>
              <pre className="max-h-44 overflow-auto bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                {file.content}
              </pre>
            </details>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <label className="block">
          <span className="text-xs font-bold text-slate-600">Command</span>
          <input
            data-sandbox-target="computer-command"
            value={command}
            placeholder={template?.starterCommand || "ls"}
            onChange={(event) => onCommandChange(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-slate-400"
          />
        </label>
        <button
          type="button"
          onClick={onRun}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
        >
          <Play className="h-3.5 w-3.5" />
          Run command
        </button>
        {output ? (
          <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
            {output}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  target,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  target?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <input
        data-sandbox-target={target}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}

function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        checked ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
      )}
    >
      {checked ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
    </span>
  );
}

function ComponentRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "lime" | "amber";
}) {
  const toneClass =
    tone === "rose"
      ? "bg-rose-100 text-rose-800"
      : tone === "lime"
        ? "bg-lime-100 text-lime-800"
        : "bg-amber-100 text-amber-800";

  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
      <span className={cn("rounded px-2 py-1 text-[11px] font-black", toneClass)}>
        {label}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-5 text-slate-600">
        {value}
      </span>
    </div>
  );
}

function memoryBadgeClass(type: AgentSandboxMemoryTemplate["type"]) {
  const base = "rounded px-2 py-1 text-[11px] font-black";
  if (type === "working") return `${base} bg-pink-100 text-pink-800`;
  if (type === "semantic") return `${base} bg-cyan-100 text-cyan-800`;
  if (type === "episodic") return `${base} bg-lime-100 text-lime-800`;
  return `${base} bg-amber-100 text-amber-800`;
}

function isGoogleTool(tool: AgentSandboxToolTemplate) {
  return (
    tool.connectorKind === "google_calendar" ||
    tool.connectorKind === "gmail" ||
    tool.connectorKind === "google_drive" ||
    tool.connectorKind === "google_sheets"
  );
}

function scopedGoogleConnectUrl(baseUrl: string, tool: AgentSandboxToolTemplate) {
  const url = new URL(baseUrl);
  url.searchParams.set("tool", tool.connectorKind || tool.id);
  url.searchParams.set("label", tool.name);
  url.searchParams.set("scopes", googleToolScopes(tool.connectorKind).join(" "));
  return url.toString();
}

function googleToolScopes(connectorKind?: AgentSandboxToolTemplate["connectorKind"]) {
  const base = ["openid", "email", "profile"];
  if (connectorKind === "google_calendar") {
    return [
      ...base,
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ];
  }
  if (connectorKind === "gmail") {
    return [
      ...base,
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ];
  }
  if (connectorKind === "google_drive") {
    return [
      ...base,
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ];
  }
  if (connectorKind === "google_sheets") {
    return [...base, "https://www.googleapis.com/auth/spreadsheets.readonly"];
  }
  return base;
}

/** Renders an official brand icon from simple-icons inside a clean rounded container */
function WorkspaceIcon({ kind }: { kind?: string }) {
  if (kind === "gmail") {
    return (
      <BrandIconBox color={`#${siGmail.hex}`} label={siGmail.title}>
        <path d={siGmail.path} />
      </BrandIconBox>
    );
  }
  if (kind === "google_calendar") {
    return (
      <BrandIconBox color={`#${siGooglecalendar.hex}`} label={siGooglecalendar.title}>
        <path d={siGooglecalendar.path} />
      </BrandIconBox>
    );
  }
  if (kind === "google_drive") {
    return (
      <BrandIconBox color={`#${siGoogledrive.hex}`} label={siGoogledrive.title}>
        <path d={siGoogledrive.path} />
      </BrandIconBox>
    );
  }
  if (kind === "google_sheets") {
    return (
      <BrandIconBox color={`#${siGooglesheets.hex}`} label={siGooglesheets.title}>
        <path d={siGooglesheets.path} />
      </BrandIconBox>
    );
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
      <Hammer className="h-4 w-4" />
    </span>
  );
}

function BrandIconBox({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <svg
        role="img"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill={color}
        xmlns="http://www.w3.org/2000/svg"
        aria-label={label}
      >
        <title>{label}</title>
        {children}
      </svg>
    </span>
  );
}

/** Four-color Google "G" logo for connect buttons */
function GoogleColorLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function ReviewBox({
  result,
  loading,
  onReview,
}: {
  result?: ReviewResult;
  loading: boolean;
  onReview: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-500">AI review</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-950">
            {result
              ? `${result.score}/100 - ${result.passed ? "Ready" : "Revise"}`
              : "Not reviewed"}
          </p>
        </div>
        <button
          type="button"
          onClick={onReview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Review
        </button>
      </div>
      {result ? (
        <div className="mt-3 space-y-2 text-xs leading-5 text-slate-700">
          <p>{result.summary}</p>
          {result.strengths.length ? (
            <p>
              <span className="font-bold text-green-700">Strengths:</span>{" "}
              {result.strengths.join(" ")}
            </p>
          ) : null}
          {result.improvements.length ? (
            <p>
              <span className="font-bold text-amber-700">Improve:</span>{" "}
              {result.improvements.join(" ")}
            </p>
          ) : null}
          {result.nextRevision ? (
            <p className="rounded-md bg-white px-2 py-1.5 font-semibold">
              {result.nextRevision}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function oneLine(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function customSkillTitle(value?: string) {
  const firstLine = (value || "").split("\n").map((line) => line.trim()).find(Boolean);
  if (!firstLine) return "Custom skill";
  return firstLine.length > 42 ? `${firstLine.slice(0, 39)}...` : firstLine;
}
