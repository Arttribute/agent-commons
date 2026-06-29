"use client";

import { useState } from "react";
import {
  Check,
  ExternalLink,
  Hammer,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentSandboxSkillTemplate, AgentSandboxToolTemplate } from "@/types/skills";
import type { AgentSandboxConfig } from "@/types/skills";
import type { ReviewResult } from "./types";

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

/** Official colored Google product SVG icons */
function WorkspaceIcon({ kind }: { kind?: string }) {
  if (kind === "gmail") return <GmailIcon />;
  if (kind === "google_calendar") return <GoogleCalendarIcon />;
  if (kind === "google_drive") return <GoogleDriveIcon />;
  if (kind === "google_sheets") return <GoogleSheetsIcon />;

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
      <Hammer className="h-4 w-4" />
    </span>
  );
}

function GmailIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      {/* Left panel */}
      <path fill="#EA4335" d="M6 40H14V24L2 16V36C2 38.21 3.79 40 6 40Z" />
      {/* Right panel */}
      <path fill="#4285F4" d="M34 40H42C44.21 40 46 38.21 46 36V16L34 24Z" />
      {/* Top-right flap */}
      <path fill="#FBBC04" d="M46 14C46 11.79 44.21 10 42 10H40.6L34 14.4V24L46 16V14Z" />
      {/* Center M body */}
      <path fill="#34A853" d="M14 24V12L24 19L34 12V24L24 31Z" />
      {/* Top-left flap */}
      <path fill="#EA4335" d="M2 14V16L14 24V12L11.4 10C9.13 8.67 6 10.24 6 13V14Z" />
    </svg>
  );
}

function GoogleCalendarIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      {/* White body */}
      <rect x="4" y="8" width="40" height="38" rx="4" fill="white" stroke="#DADCE0" strokeWidth="1" />
      {/* Blue header */}
      <rect x="4" y="8" width="40" height="13" rx="4" fill="#4285F4" />
      <rect x="4" y="17" width="40" height="4" fill="#4285F4" />
      {/* Ring pegs */}
      <rect x="14" y="3" width="4" height="11" rx="2" fill="#1565C0" />
      <rect x="30" y="3" width="4" height="11" rx="2" fill="#1565C0" />
      {/* Date */}
      <text
        x="24"
        y="38"
        textAnchor="middle"
        fill="#3C4043"
        fontSize="15"
        fontWeight="700"
        fontFamily="sans-serif"
      >
        31
      </text>
    </svg>
  );
}

function GoogleDriveIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      {/* Green: top arm */}
      <path fill="#34A853" d="M12 2L7 11H17L12 2Z" />
      {/* Blue: bottom-left arm */}
      <path fill="#4285F4" d="M7 11L2 20H12L7 11Z" />
      {/* Yellow: bottom-right arm */}
      <path fill="#FBBC04" d="M17 11L12 20H22L17 11Z" />
      {/* Center connector */}
      <path fill="#1A73E8" d="M7 11L12 20H17L12 11Z" opacity="0.15" />
    </svg>
  );
}

function GoogleSheetsIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      {/* Page body */}
      <path
        fill="#0F9D58"
        d="M10 4H32L42 14V44C42 46.21 40.21 48 38 48H10C7.79 48 6 46.21 6 44V8C6 5.79 7.79 4 10 4Z"
      />
      {/* Folded corner */}
      <path fill="#087447" d="M32 4L42 14H32V4Z" />
      {/* White grid — horizontal lines */}
      <rect x="14" y="22" width="20" height="2" rx="0.5" fill="white" />
      <rect x="14" y="28" width="20" height="2" rx="0.5" fill="white" />
      <rect x="14" y="34" width="20" height="2" rx="0.5" fill="white" />
      {/* White grid — vertical lines */}
      <rect x="14" y="22" width="2" height="14" rx="0.5" fill="white" />
      <rect x="23" y="22" width="2" height="14" rx="0.5" fill="white" />
    </svg>
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
