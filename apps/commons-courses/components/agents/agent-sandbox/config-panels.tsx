"use client";

import { ExternalLink, Hammer, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentSandboxSkillTemplate, AgentSandboxToolTemplate } from "@/types/skills";
import type { ReviewResult } from "./types";

export function IdentityPanel({
  agentName,
  persona,
  systemPrompt,
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
  reviewEnabled: boolean;
  review?: ReviewResult;
  reviewing: boolean;
  onNameChange: (value: string) => void;
  onPersonaChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onReview: () => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Agent name" value={agentName} onChange={onNameChange} />
      <Field label="Role" value={persona} onChange={onPersonaChange} />
      <label className="block">
        <span className="text-xs font-bold text-slate-600">System prompt</span>
        <textarea
          value={systemPrompt}
          onChange={(event) => onPromptChange(event.target.value)}
          className="mt-1.5 min-h-40 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400"
        />
      </label>
      {reviewEnabled ? (
        <ReviewBox
          targetLabel="system prompt"
          result={review}
          loading={reviewing}
          onReview={onReview}
        />
      ) : null}
    </div>
  );
}

export function SkillsPanel({
  skills,
  selected,
  skillInstructions,
  onChange,
  onInstructionChange,
  reviewEnabled,
  review,
  reviewing,
  onReview,
}: {
  skills: AgentSandboxSkillTemplate[];
  selected: string[];
  skillInstructions: Record<string, string>;
  onChange: (items: string[]) => void;
  onInstructionChange: (id: string, value: string) => void;
  reviewEnabled: boolean;
  review?: ReviewResult;
  reviewing: boolean;
  onReview: () => void;
}) {
  return (
    <div className="space-y-3">
      <Picker
        items={skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description:
            skillInstructions[skill.id] || skill.instructions,
        }))}
        selected={selected}
        onChange={onChange}
      />
      {selected.length ? (
        <div className="space-y-3">
          {skills
            .filter((skill) => selected.includes(skill.id))
            .map((skill) => (
              <label key={skill.id} className="block">
                <span className="text-xs font-bold text-slate-600">
                  {skill.name} instructions
                </span>
                <textarea
                  value={skillInstructions[skill.id] || skill.instructions}
                  onChange={(event) =>
                    onInstructionChange(skill.id, event.target.value)
                  }
                  className="mt-1.5 min-h-28 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400"
                />
              </label>
            ))}
        </div>
      ) : null}
      {reviewEnabled ? (
        <ReviewBox
          targetLabel="skills"
          result={review}
          loading={reviewing}
          onReview={onReview}
        />
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
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        Google tools require a real Google Workspace OAuth connection. Selecting a
        tool here adds it to the agent instructions; connecting grants real access.
      </div>
      <Picker
        items={tools.map((tool) => ({
          id: tool.id,
          name: tool.name,
          connectorKind: tool.connectorKind,
          description: tool.description || "Requires a connected tool provider.",
        }))}
        selected={selected}
        onChange={onChange}
      />
      <a
        href={googleConnectUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
      >
        <ExternalLink className="h-4 w-4" />
        Connect Google Workspace
      </a>
    </div>
  );
}

export function WorkflowPanel({
  taskTitle,
  onTaskChange,
}: {
  taskTitle: string;
  onTaskChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="First task" value={taskTitle} onChange={onTaskChange} />
      <div className="grid gap-2 text-xs font-bold text-slate-700">
        {[
          "System prompt",
          "Skill instructions",
          "Connected tools",
          "Agent response",
          "Logs",
        ].map((item, index) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px]">
              {index + 1}
            </span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}

function ReviewBox({
  targetLabel,
  result,
  loading,
  onReview,
}: {
  targetLabel: string;
  result?: ReviewResult;
  loading: boolean;
  onReview: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            AI review
          </p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {result
              ? `${result.score}/100 - ${result.passed ? "Ready" : "Revise"}`
              : "Not reviewed"}
          </p>
        </div>
        <button
          type="button"
          onClick={onReview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Review {targetLabel}
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

function Picker({
  items,
  selected,
  onChange,
}: {
  items: Array<{
    id: string;
    name: string;
    description?: string;
    connectorKind?: string;
  }>;
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  if (!items.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
        No templates configured for this lesson.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const checked = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              onChange(
                checked
                  ? selected.filter((id) => id !== item.id)
                  : [...selected, item.id]
              )
            }
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
              checked
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            )}
          >
            <ConnectorLogo kind={item.connectorKind} />
            <span className="min-w-0">
              <span className="block text-sm font-bold">{item.name}</span>
              {item.description ? (
                <span
                  className={cn(
                    "mt-1 block text-xs leading-5",
                    checked ? "text-white/65" : "text-slate-500"
                  )}
                >
                  {item.description}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ConnectorLogo({ kind }: { kind?: string }) {
  if (!kind?.startsWith("google_") && kind !== "gmail") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Hammer className="h-4 w-4" />
      </span>
    );
  }

  if (kind === "google_drive") {
    return (
      <span className="relative h-9 w-9 shrink-0 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <span className="absolute left-[15px] top-1 h-6 w-2 rotate-[30deg] rounded-sm bg-[#0F9D58]" />
        <span className="absolute bottom-1 left-2 h-2 w-6 rounded-sm bg-[#4285F4]" />
        <span className="absolute right-2 top-1 h-6 w-2 -rotate-[30deg] rounded-sm bg-[#F4B400]" />
      </span>
    );
  }

  const label = kind === "gmail" ? "M" : kind === "google_calendar" ? "31" : "S";
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-[11px] font-black text-slate-700 shadow-sm ring-1 ring-slate-200">
      <span className="absolute inset-x-0 top-0 h-1.5 bg-[#4285F4]" />
      <span className="absolute inset-y-0 left-0 w-1.5 bg-[#34A853]" />
      <span className="absolute inset-y-0 right-0 w-1.5 bg-[#FBBC04]" />
      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-[#EA4335]" />
      {label}
    </span>
  );
}
