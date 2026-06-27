"use client";

import type {
  AgentSandboxCapability,
  AgentSandboxConfig,
  AgentSandboxStepTarget,
} from "@/types/skills";
import { createSandboxConfig } from "./sandbox-defaults";

type SandboxSkillTemplate = NonNullable<AgentSandboxConfig["skillTemplates"]>[number];
type SandboxToolTemplate = NonNullable<AgentSandboxConfig["toolTemplates"]>[number];
type SandboxTemplate = SandboxSkillTemplate | SandboxToolTemplate;

const sandboxCapabilities: AgentSandboxCapability[] = [
  "identity",
  "system_prompt",
  "skills",
  "tools",
  "connectors",
  "tasks",
  "workflows",
  "chat",
  "logs",
  "credits",
];

const sandboxTargets: AgentSandboxStepTarget[] = [
  "identity",
  "system_prompt",
  "skills",
  "tools",
  "connectors",
  "tasks",
  "workflows",
  "chat",
  "logs",
  "publish",
];

export function SandboxConfigEditor({
  value,
  onChange,
}: {
  value?: AgentSandboxConfig;
  onChange: (sandbox?: AgentSandboxConfig) => void;
}) {
  const sandbox = value || createSandboxConfig();
  const enabled = Boolean(value?.enabled);
  const update = (patch: Partial<AgentSandboxConfig>) =>
    onChange({ ...sandbox, enabled: true, ...patch });

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">Agent learner sandbox</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Choose the minimal Agent Commons surface learners can use for this challenge.
          </p>
        </div>
        <Toggle
          label="Enable"
          checked={enabled}
          onChange={(checked) => onChange(checked ? sandbox : undefined)}
        />
      </div>

      {enabled ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              label="Sandbox title"
              value={sandbox.title || ""}
              onChange={(title) => update({ title })}
            />
            <label>
              <span className="text-sm font-bold text-slate-700">Mode</span>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sandbox.mode}
                onChange={(event) =>
                  update({ mode: event.target.value as AgentSandboxConfig["mode"] })
                }
              >
                <option value="simple">Simple</option>
                <option value="builder">Builder</option>
                <option value="full">Full</option>
              </select>
            </label>
            <Field
              label="Credit reward"
              type="number"
              value={String(sandbox.creditReward || 0)}
              onChange={(creditReward) =>
                update({ creditReward: Number(creditReward) || 0 })
              }
            />
          </div>
          <TextArea
            label="Brief"
            value={sandbox.brief || ""}
            onChange={(brief) => update({ brief })}
          />

          <SandboxIntroEditor sandbox={sandbox} update={update} />
          <SandboxCompletionEditor sandbox={sandbox} update={update} />

          <div className="grid gap-3 md:grid-cols-2">
            <CheckboxList
              label="Visible capabilities"
              items={sandboxCapabilities}
              selected={sandbox.capabilities || []}
              onChange={(capabilities) => update({ capabilities })}
            />
            <CheckboxList
              label="Required to complete"
              items={sandboxCapabilities.filter((item) => item !== "credits")}
              selected={sandbox.requiredCapabilities || []}
              onChange={(requiredCapabilities) => update({ requiredCapabilities })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <TextArea
              label="Starter system prompt"
              value={sandbox.starterAgent?.systemPrompt || ""}
              onChange={(systemPrompt) =>
                update({
                  starterAgent: {
                    ...sandbox.starterAgent,
                    systemPrompt,
                  },
                })
              }
            />
            <div className="grid gap-3">
              <Field
                label="Starter agent name"
                value={sandbox.starterAgent?.name || ""}
                onChange={(name) =>
                  update({ starterAgent: { ...sandbox.starterAgent, name } })
                }
              />
              <Field
                label="Starter role"
                value={sandbox.starterAgent?.persona || ""}
                onChange={(persona) =>
                  update({ starterAgent: { ...sandbox.starterAgent, persona } })
                }
              />
            </div>
          </div>

          <TemplateList
            title="Skill templates"
            kind="skill"
            rows={sandbox.skillTemplates || []}
            onChange={(skillTemplates) =>
              update({ skillTemplates: skillTemplates as SandboxSkillTemplate[] })
            }
          />
          <TemplateList
            title="Tool and connector templates"
            kind="tool"
            rows={sandbox.toolTemplates || []}
            onChange={(toolTemplates) =>
              update({ toolTemplates: toolTemplates as SandboxToolTemplate[] })
            }
          />
          <ReviewConfigEditor
            value={sandbox.review}
            onChange={(review) => update({ review })}
          />
          <GuideStepEditor
            steps={sandbox.guideSteps || []}
            onChange={(guideSteps) => update({ guideSteps })}
          />
        </div>
      ) : null}
    </div>
  );
}

function SandboxIntroEditor({
  sandbox,
  update,
}: {
  sandbox: AgentSandboxConfig;
  update: (patch: Partial<AgentSandboxConfig>) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">Learner intro screen</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Explain the task before learners enter the live sandbox.
          </p>
        </div>
        <Toggle
          label="Show intro"
          checked={Boolean(sandbox.intro?.enabled)}
          onChange={(enabled) => update({ intro: { ...sandbox.intro, enabled } })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Intro title"
          value={sandbox.intro?.title || ""}
          onChange={(title) =>
            update({ intro: { ...sandbox.intro, title, enabled: true } })
          }
        />
        <Field
          label="Start button"
          value={sandbox.intro?.startLabel || ""}
          onChange={(startLabel) =>
            update({ intro: { ...sandbox.intro, startLabel, enabled: true } })
          }
        />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <TextArea
          label="Intro body"
          value={sandbox.intro?.body || ""}
          onChange={(body) =>
            update({ intro: { ...sandbox.intro, body, enabled: true } })
          }
        />
        <TextArea
          label="Expectations, one per line"
          value={(sandbox.intro?.expectations || []).join("\n")}
          onChange={(value) =>
            update({
              intro: {
                ...sandbox.intro,
                enabled: true,
                expectations: value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              },
            })
          }
        />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field
          label="Info title"
          value={sandbox.intro?.infoTitle || ""}
          onChange={(infoTitle) =>
            update({ intro: { ...sandbox.intro, infoTitle, enabled: true } })
          }
        />
        <TextArea
          label="Info body"
          value={sandbox.intro?.infoBody || ""}
          onChange={(infoBody) =>
            update({ intro: { ...sandbox.intro, infoBody, enabled: true } })
          }
        />
      </div>
    </div>
  );
}

function SandboxCompletionEditor({
  sandbox,
  update,
}: {
  sandbox: AgentSandboxConfig;
  update: (patch: Partial<AgentSandboxConfig>) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-3 text-sm font-black text-slate-950">Completion state</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Completion title"
          value={sandbox.completion?.title || ""}
          onChange={(title) =>
            update({ completion: { ...sandbox.completion, title } })
          }
        />
        <Field
          label="Continue button"
          value={sandbox.completion?.primaryActionLabel || ""}
          onChange={(primaryActionLabel) =>
            update({
              completion: {
                ...sandbox.completion,
                primaryActionLabel,
              },
            })
          }
        />
      </div>
      <div className="mt-3">
        <TextArea
          label="Completion body"
          value={sandbox.completion?.body || ""}
          onChange={(body) =>
            update({ completion: { ...sandbox.completion, body } })
          }
        />
      </div>
    </div>
  );
}

function ReviewConfigEditor({
  value,
  onChange,
}: {
  value: AgentSandboxConfig["review"];
  onChange: (review: NonNullable<AgentSandboxConfig["review"]>) => void;
}) {
  const review = value || {
    enabled: false,
    targets: ["system_prompt" as const],
    minScore: 70,
    rubric: "",
    model: "",
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">AI reviewer</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Give learners quiz-like feedback on prompts or skills before they create the agent.
          </p>
        </div>
        <Toggle
          label="Enable"
          checked={Boolean(review.enabled)}
          onChange={(enabled) => onChange({ ...review, enabled })}
        />
      </div>
      {review.enabled ? (
        <div className="grid gap-3 md:grid-cols-2">
          <CheckboxList
            label="Review targets"
            items={["system_prompt", "skills"]}
            selected={review.targets || []}
            onChange={(targets) => onChange({ ...review, targets })}
          />
          <div className="grid gap-3">
            <Field
              label="Passing score"
              type="number"
              value={String(review.minScore || 70)}
              onChange={(minScore) =>
                onChange({ ...review, minScore: Number(minScore) || 70 })
              }
            />
            <Field
              label="Review model"
              value={review.model || ""}
              onChange={(model) => onChange({ ...review, model })}
            />
          </div>
          <div className="md:col-span-2">
            <TextArea
              label="Rubric"
              value={review.rubric || ""}
              onChange={(rubric) => onChange({ ...review, rubric })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CheckboxList<T extends string>({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: T[];
  selected: T[];
  onChange: (items: T[]) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-slate-700">{label}</p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3">
        {items.map((item) => (
          <label key={item} className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={selected.includes(item)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? Array.from(new Set([...selected, item]))
                    : selected.filter((value) => value !== item)
                )
              }
            />
            {item.replace(/_/g, " ")}
          </label>
        ))}
      </div>
    </div>
  );
}

function TemplateList({
  title,
  kind,
  rows,
  onChange,
}: {
  title: string;
  kind: "skill" | "tool";
  rows: SandboxTemplate[];
  onChange: (rows: SandboxTemplate[]) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-950">{title}</p>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...rows,
              kind === "skill"
                ? {
                    id: `skill-${rows.length + 1}`,
                    name: "New skill",
                    instructions: "",
                  }
                : {
                    id: `tool-${rows.length + 1}`,
                    name: "New tool",
                    description: "",
                    connectorKind: "custom",
                    simulated: true,
                  },
            ])
          }
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50"
        >
          Add
        </button>
      </div>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.id || index} className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]">
            <Field
              label="Name"
              value={row.name || ""}
              onChange={(name) => {
                const next = [...rows];
                next[index] = { ...row, name };
                onChange(next);
              }}
            />
            {kind === "tool" ? (
              <label>
                <span className="text-sm font-bold text-slate-700">Connector</span>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={"connectorKind" in row ? row.connectorKind || "custom" : "custom"}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = {
                      ...row,
                      connectorKind: event.target.value as SandboxToolTemplate["connectorKind"],
                    };
                    onChange(next);
                  }}
                >
                  <option value="custom">Custom</option>
                  <option value="google_calendar">Google Calendar</option>
                  <option value="gmail">Gmail</option>
                  <option value="google_drive">Google Drive</option>
                  <option value="google_sheets">Google Sheets</option>
                  <option value="github">GitHub</option>
                </select>
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
              className="self-end rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white"
            >
              Remove
            </button>
            <div className="md:col-span-3">
              <TextArea
                label={kind === "skill" ? "Instructions" : "Description"}
                value={
                  kind === "skill"
                    ? "instructions" in row
                      ? row.instructions || ""
                      : ""
                    : "description" in row
                      ? row.description || ""
                      : ""
                }
                onChange={(value) => {
                  const next = [...rows];
                  next[index] =
                    kind === "skill"
                      ? { ...row, instructions: value }
                      : { ...row, description: value };
                  onChange(next);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuideStepEditor({
  steps,
  onChange,
}: {
  steps: AgentSandboxConfig["guideSteps"];
  onChange: (steps: AgentSandboxConfig["guideSteps"]) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-950">Guided highlights</p>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...steps,
              {
                id: `step-${steps.length + 1}`,
                target: "identity",
                title: "New step",
                body: "",
              },
            ])
          }
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50"
        >
          Add step
        </button>
      </div>
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id || index}
            className="grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]"
          >
            <Field
              label="Title"
              value={step.title}
              onChange={(title) => {
                const next = [...steps];
                next[index] = { ...step, title };
                onChange(next);
              }}
            />
            <label>
              <span className="text-sm font-bold text-slate-700">Target</span>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={step.target}
                onChange={(event) => {
                  const next = [...steps];
                  next[index] = {
                    ...step,
                    target: event.target.value as AgentSandboxStepTarget,
                  };
                  onChange(next);
                }}
              >
                {sandboxTargets.map((target) => (
                  <option key={target} value={target}>
                    {target.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onChange(steps.filter((_, stepIndex) => stepIndex !== index))}
              className="self-end rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white"
            >
              Remove
            </button>
            <div className="md:col-span-3">
              <TextArea
                label="Instruction"
                value={step.body}
                onChange={(body) => {
                  const next = [...steps];
                  next[index] = { ...step, body };
                  onChange(next);
                }}
              />
            </div>
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
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}

function TextArea({
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
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
