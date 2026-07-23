"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Database,
  ExternalLink,
  Hammer,
  FileText,
  Loader2,
  Monitor,
  Play,
  Plus,
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
  persona,
  systemPrompt,
  showIdentity,
  showSystemPrompt,
  placeholders,
  reviewEnabled,
  review,
  reviewing,
  onNameChange,
  onPersonaChange,
  onPromptChange,
  onReview,
}: {
  agentName: string;
  persona: string;
  systemPrompt: string;
  showIdentity: boolean;
  showSystemPrompt: boolean;
  placeholders?: AgentSandboxConfig["placeholders"];
  reviewEnabled: boolean;
  review?: ReviewResult;
  reviewing: boolean;
  onNameChange: (value: string) => void;
  onPersonaChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onReview: () => void;
}) {
  return (
    <div className="space-y-4" data-sandbox-target="identity">
      {showIdentity ? (
        <StudioPanel title="Profile">
          <div className="grid gap-5 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div className="flex flex-col items-center gap-2 sm:items-start">
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-950 text-2xl font-semibold text-white">
                {(agentName || "A").trim().charAt(0).toUpperCase()}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                Private sandbox
              </span>
            </div>
            <div className="space-y-4">
              <Field
                label="Agent name"
                value={agentName}
                placeholder={placeholders?.agentName || "Study Coach"}
                onChange={onNameChange}
                target="agent-name"
              />
              <p className="text-xs leading-5 text-slate-500">
                This learner-only profile mirrors how the agent will appear in
                sessions. Nothing is published outside this course.
              </p>
            </div>
          </div>
        </StudioPanel>
      ) : null}
      {showIdentity || showSystemPrompt ? (
        <StudioPanel title="Behavior">
          <div className="space-y-5">
            {showIdentity ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-800">
                  Persona
                </span>
                <p className="mt-0.5 text-xs text-slate-500">
                  Describe the voice, role, and point of view this agent uses.
                </p>
                <textarea
                  data-sandbox-target="agent-persona"
                  value={persona}
                  placeholder={
                    placeholders?.persona ||
                    "A practical planning assistant for learners"
                  }
                  onChange={(event) => onPersonaChange(event.target.value)}
                  className="mt-2 min-h-28 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-500"
                />
              </label>
            ) : null}
            {showSystemPrompt ? (
              <label className="block border-t border-slate-100 pt-5">
                <span className="text-sm font-medium text-slate-800">
                  System prompt
                </span>
                <p className="mt-0.5 text-xs text-slate-500">
                  Set the agent&apos;s goal, boundaries, and tool-use rules.
                </p>
                <textarea
                  data-sandbox-target="system-prompt"
                  value={systemPrompt}
                  placeholder={
                    placeholders?.systemPrompt ||
                    "You are a helpful agent. Explain your goal, tone, boundaries, and when to use connected tools."
                  }
                  onChange={(event) => onPromptChange(event.target.value)}
                  className="mt-2 min-h-52 w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-500"
                />
              </label>
            ) : null}
          </div>
        </StudioPanel>
      ) : null}
      {showSystemPrompt && reviewEnabled ? (
        <StudioPanel title="Prompt review">
          <div data-sandbox-target="review-box">
            <ReviewBox
              result={review}
              loading={reviewing}
              onReview={onReview}
            />
          </div>
        </StudioPanel>
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
    <div
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]"
      data-sandbox-target="skills"
    >
      <StudioPanel
        title="Agent skills"
        action={
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
            {listItems.length} available
          </span>
        }
      >
        <p className="mb-4 text-xs leading-5 text-slate-500">
          Select a reusable instruction set to attach to this course agent.
        </p>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
          {listItems.map((skill) => {
            const active = skill.id === selectedId;
            const description =
              skillInstructions[skill.id] || skill.instructions;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => onChange(active ? [] : [skill.id])}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                  active ? "bg-slate-50" : "bg-white hover:bg-slate-50",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {skill.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {oneLine(description) || "No instructions yet."}
                  </span>
                </span>
                <CheckCircle checked={active} />
              </button>
            );
          })}
          {!listItems.length ? (
            <p className="p-5 text-center text-sm text-slate-500">
              No lesson skills have been configured yet.
            </p>
          ) : null}
        </div>
      </StudioPanel>

      <StudioPanel title={selectedSkill ? "Edit skill" : "Create a skill"}>
        {selectedSkill ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {selectedSkill.name}
                </p>
                <p className="text-xs text-slate-500">Markdown instructions</p>
              </div>
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close skill"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              data-sandbox-target="skill-instructions"
              value={
                skillInstructions[selectedSkill.id] ||
                selectedSkill.instructions
              }
              placeholder={
                placeholder || "Write the steps this agent should follow..."
              }
              onChange={(event) =>
                onInstructionChange(selectedSkill.id, event.target.value)
              }
              className="min-h-72 w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-slate-500"
            />
          </div>
        ) : (
          <div>
            <p className="mb-3 text-xs leading-5 text-slate-500">
              Write a focused process the agent can reuse during a session.
            </p>
            <textarea
              data-sandbox-target="skill-instructions"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                placeholder || "Describe a skill this agent should use..."
              }
              className="min-h-56 w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-slate-500"
            />
            <button
              type="button"
              onClick={() => {
                onAddSkill(draft);
                setDraft("");
              }}
              disabled={!draft.trim()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Plus className="h-3.5 w-3.5" />
              Add skill
            </button>
          </div>
        )}
        {reviewEnabled ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <ReviewBox
              result={review}
              loading={reviewing}
              onReview={onReview}
            />
          </div>
        ) : null}
      </StudioPanel>
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
  const [activeToolId, setActiveToolId] = useState(tools[0]?.id || "");
  const [filter, setFilter] = useState<"all" | "connected" | "available">(
    "all",
  );
  const activeTool = tools.find((tool) => tool.id === activeToolId) || tools[0];
  const visibleTools = tools.filter((tool) => {
    if (filter === "connected") return selected.includes(tool.id);
    if (filter === "available") return !selected.includes(tool.id);
    return true;
  });
  const hasSelectedGoogleTool = tools.some(
    (tool) => selected.includes(tool.id) && isGoogleTool(tool),
  );

  return (
    <div
      className="grid min-h-[540px] overflow-hidden rounded-lg border border-slate-200 bg-white lg:grid-cols-[320px_minmax(0,1fr)]"
      data-sandbox-target="tools"
    >
      <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-950">Tools</h2>
            <span className="text-xs text-slate-500">
              {selected.length} enabled
            </span>
          </div>
          <div className="mt-3 flex gap-1 rounded-md bg-slate-100 p-1">
            {(["all", "connected", "available"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-[11px] font-medium capitalize",
                  filter === item
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[430px] overflow-y-auto p-2">
          {visibleTools.map((tool) => {
            const checked = selected.includes(tool.id);
            const active = tool.id === activeTool?.id;
            return (
              <button
                key={tool.id}
                type="button"
                data-sandbox-target={
                  tool.id === "google-calendar" ||
                  tool.connectorKind === "google_calendar"
                    ? "tool-google-calendar"
                    : undefined
                }
                onClick={() => setActiveToolId(tool.id)}
                className={cn(
                  "mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left",
                  active ? "bg-slate-100" : "hover:bg-slate-50",
                )}
              >
                <WorkspaceIcon kind={tool.connectorKind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {tool.name}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {checked ? "Enabled" : "Not enabled"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            );
          })}
          {!visibleTools.length ? (
            <p className="px-3 py-8 text-center text-xs text-slate-500">
              No tools match this filter.
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {activeTool ? (
          <div className="mx-auto max-w-xl">
            <div className="flex items-start gap-4">
              <WorkspaceIcon kind={activeTool.connectorKind} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-medium text-slate-950">
                  {activeTool.name}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {activeTool.description ||
                    "Give this agent access to the selected capability."}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    selected.includes(activeTool.id)
                      ? selected.filter((id) => id !== activeTool.id)
                      : [...selected, activeTool.id],
                  )
                }
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  selected.includes(activeTool.id)
                    ? "bg-slate-950"
                    : "bg-slate-300",
                )}
                aria-label={`${selected.includes(activeTool.id) ? "Disable" : "Enable"} ${activeTool.name}`}
              >
                <span
                  className={cn(
                    "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
                    selected.includes(activeTool.id)
                      ? "translate-x-6"
                      : "translate-x-1",
                  )}
                />
              </button>
            </div>

            <div className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Connection
              </p>
              {isGoogleTool(activeTool) ? (
                <div className="mt-3" data-sandbox-target="connect-google">
                  <p className="mb-3 text-sm leading-6 text-slate-600">
                    Connect Google Workspace so this agent can use the scopes
                    selected for this lesson.
                  </p>
                  <a
                    href={scopedGoogleConnectUrl(googleConnectUrl, activeTool)}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <GoogleColorLogo className="h-4 w-4" />
                    Connect {activeTool.name}
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  This lesson tool needs no external account connection.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No tools configured for this lesson.
          </div>
        )}
        {!activeTool && !hasSelectedGoogleTool ? (
          <a href={googleConnectUrl} className="sr-only">
            Connect Google Workspace
          </a>
        ) : null}
      </div>
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
    <StudioPanel
      title="Scheduled tasks"
      action={
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
          {selected.length} active
        </span>
      }
    >
      <div className="space-y-4" data-sandbox-target="tasks">
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
            No scheduled tasks configured for this lesson.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
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
                        : [...selected, task.id],
                    )
                  }
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
                    checked ? "bg-slate-50" : "bg-white hover:bg-slate-50",
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
                  <span
                    className={cn(
                      "mt-1 rounded-full px-2 py-1 text-[10px] font-semibold",
                      checked
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {checked ? "Active" : "Paused"}
                  </span>
                  <CheckCircle checked={checked} />
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs leading-5 text-slate-500">
          Tasks model the studio scheduling experience without starting a real
          background job from a learner workspace.
        </p>
      </div>
    </StudioPanel>
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
  const selected =
    workflows.find((workflow) => workflow.id === selectedId) || workflows[0];

  return (
    <div
      className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"
      data-sandbox-target="workflows"
    >
      {workflows.length === 0 ? (
        <StudioPanel title="Workflows">
          <p className="rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
            No workflow configured for this lesson.
          </p>
        </StudioPanel>
      ) : (
        <>
          <StudioPanel title="Workflows">
            <div className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
              {workflows.map((workflow) => {
                const active = workflow.id === selected?.id;
                return (
                  <button
                    key={workflow.id}
                    type="button"
                    onClick={() => onSelect(workflow.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-3 text-left",
                      active ? "bg-slate-50" : "bg-white hover:bg-slate-50",
                    )}
                  >
                    <Workflow className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {workflow.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        Trigger: {workflow.trigger}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </StudioPanel>
          {selected ? (
            <StudioPanel
              title={selected.name}
              action={
                <button
                  type="button"
                  data-sandbox-target="workflow-run"
                  onClick={onRun}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                >
                  <Play className="h-3.5 w-3.5" />
                  Run simulation
                </button>
              }
            >
              {selected.description ? (
                <p className="text-sm leading-6 text-slate-600">
                  {selected.description}
                </p>
              ) : null}
              <div className="mt-4 space-y-2">
                <ComponentRow
                  label="Trigger"
                  value={selected.trigger}
                  tone="rose"
                />
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
              {result.length ? (
                <div className="mt-4 rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
                  {result.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ) : null}
            </StudioPanel>
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
  const filled = memories.filter((memory) =>
    (entries[memory.id] ?? memory.content).trim(),
  ).length;
  return (
    <div className="space-y-4" data-sandbox-target="memory">
      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3">
        <MemoryStat label="Records" value={String(memories.length)} />
        <MemoryStat label="With context" value={String(filled)} />
        <MemoryStat
          label="Memory types"
          value={String(new Set(memories.map((memory) => memory.type)).size)}
        />
      </div>
      <StudioPanel title="Agent memory">
        <p className="mb-4 text-xs leading-5 text-slate-500">
          Shape the durable context available to the agent in this lesson. These
          records stay scoped to the learner sandbox.
        </p>
        {memories.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
            No memory records configured for this lesson.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {memories.map((memory) => (
              <label
                key={memory.id}
                data-sandbox-target={`memory-${memory.type}`}
                className="block rounded-md border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Database className="h-4 w-4 text-slate-500" />
                    {memory.label}
                  </span>
                  <span className={memoryBadgeClass(memory.type)}>
                    {memory.type}
                  </span>
                </span>
                <textarea
                  value={entries[memory.id] ?? memory.content}
                  onChange={(event) => onChange(memory.id, event.target.value)}
                  className="mt-3 min-h-28 w-full resize-y rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>
            ))}
          </div>
        )}
      </StudioPanel>
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
  const [selectedPath, setSelectedPath] = useState(files[0]?.path || "");
  const selectedFile =
    files.find((file) => file.path === selectedPath) || files[0];

  return (
    <div
      className="overflow-hidden rounded-lg border border-slate-300 bg-slate-950 shadow-sm"
      data-sandbox-target="computer"
    >
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <Monitor className="h-4 w-4 text-slate-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {template?.workspaceName || "Sandbox workspace"}
            </p>
            <p className="truncate text-[11px] text-slate-400">
              {template?.isolationMode || "Scoped learner runtime"}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Ready
        </span>
      </div>

      <div className="grid min-h-[520px] md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="border-b border-slate-800 bg-slate-900/80 md:border-b-0 md:border-r">
          <p className="px-3 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Explorer
          </p>
          <div className="px-2 pb-3">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs",
                  file.path === selectedFile?.path
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white",
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{file.path}</span>
              </button>
            ))}
            {!files.length ? (
              <p className="px-2 py-4 text-xs text-slate-500">No files</p>
            ) : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="min-h-0 flex-1">
            <div className="border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-400">
              {selectedFile?.path || "Terminal"}
            </div>
            <pre className="max-h-64 min-h-52 overflow-auto p-4 font-mono text-xs leading-6 text-slate-300">
              {selectedFile?.content ||
                "# Select a file or use the terminal below."}
            </pre>
          </div>
          <div className="border-t border-slate-800 bg-black/30 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Terminal
            </p>
            <div className="flex items-center gap-2 font-mono text-sm">
              <span className="text-emerald-400">$</span>
              <input
                data-sandbox-target="computer-command"
                value={command}
                placeholder={template?.starterCommand || "ls"}
                onChange={(event) => onCommandChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onRun();
                }}
                className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={onRun}
                className="rounded bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-600"
              >
                Run
              </button>
            </div>
            {output ? (
              <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-slate-300">
                {output}
              </pre>
            ) : (
              <p className="mt-3 text-xs text-slate-600">
                Try ls, pwd, cat &lt;file&gt;, or run team.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudioPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-950">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MemoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-200 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-medium text-slate-950">{value}</p>
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
        checked ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white",
      )}
    >
      {checked ? (
        <Check className="h-3 w-3 text-white" strokeWidth={3} />
      ) : null}
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
      <span
        className={cn("rounded px-2 py-1 text-[11px] font-black", toneClass)}
      >
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

function scopedGoogleConnectUrl(
  baseUrl: string,
  tool: AgentSandboxToolTemplate,
) {
  const url = new URL(baseUrl);
  url.searchParams.set("tool", tool.connectorKind || tool.id);
  url.searchParams.set("label", tool.name);
  url.searchParams.set(
    "scopes",
    googleToolScopes(tool.connectorKind).join(" "),
  );
  return url.toString();
}

function googleToolScopes(
  connectorKind?: AgentSandboxToolTemplate["connectorKind"],
) {
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
      <BrandIconBox
        color={`#${siGooglecalendar.hex}`}
        label={siGooglecalendar.title}
      >
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
      <BrandIconBox
        color={`#${siGooglesheets.hex}`}
        label={siGooglesheets.title}
      >
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
  const firstLine = (value || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Custom skill";
  return firstLine.length > 42 ? `${firstLine.slice(0, 39)}...` : firstLine;
}
