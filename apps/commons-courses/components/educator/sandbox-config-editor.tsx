"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  AgentSandboxCapability,
  AgentSandboxConfig,
  AgentSandboxStepTarget,
} from "@/types/skills";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid, Input, Select, SwitchRow, Textarea } from "@/components/ui/field";
import { Card, Disclosure, EmptyState, SectionTitle } from "@/components/ui/surface";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { createSandboxConfig } from "./sandbox-defaults";

type SandboxSkillTemplate = NonNullable<AgentSandboxConfig["skillTemplates"]>[number];
type SandboxToolTemplate = NonNullable<AgentSandboxConfig["toolTemplates"]>[number];
type SandboxTemplate = SandboxSkillTemplate | SandboxToolTemplate;
type Update = (patch: Partial<AgentSandboxConfig>) => void;

const sandboxCapabilities: AgentSandboxCapability[] = [
  "identity",
  "system_prompt",
  "skills",
  "tools",
  "connectors",
  "tasks",
  "workflows",
  "memory",
  "computer",
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
  "memory",
  "computer",
  "chat",
  "logs",
  "publish",
];

const SECTIONS = [
  { value: "setup", label: "Setup" },
  { value: "screens", label: "Screens" },
  { value: "capabilities", label: "Capabilities" },
  { value: "agent", label: "Starter agent" },
  { value: "templates", label: "Templates" },
  { value: "review", label: "Review" },
  { value: "guide", label: "Guide" },
] as const;
type Section = (typeof SECTIONS)[number]["value"];

/**
 * Agent learner sandbox settings for one skill challenge. Each concern has
 * its own small view so the educator edits one thing at a time.
 */
export function SandboxConfigEditor({
  value,
  onChange,
}: {
  value?: AgentSandboxConfig;
  onChange: (sandbox?: AgentSandboxConfig) => void;
}) {
  const sandbox = value || createSandboxConfig();
  const enabled = Boolean(value?.enabled);
  const [section, setSection] = useState<Section>("setup");
  const update: Update = (patch) => onChange({ ...sandbox, enabled: true, ...patch });

  return (
    <div className="space-y-4">
      <Card className="py-2">
        <SwitchRow
          label="Agent learner sandbox"
          info="Gives learners a minimal Agent Commons workspace for this challenge. Credit rewards follow the central CommonLab campaign."
          checked={enabled}
          onChange={(checked) => onChange(checked ? sandbox : undefined)}
        />
      </Card>

      {enabled ? (
        <>
          <div className="overflow-x-auto">
            <Segmented size="sm" items={[...SECTIONS]} value={section} onChange={setSection} />
          </div>

          {section === "setup" ? (
            <Card className="space-y-4">
              <FieldGrid>
                <Field label="Sandbox title">
                  <Input value={sandbox.title || ""} onChange={(event) => update({ title: event.target.value })} />
                </Field>
                <Field
                  label="Mode"
                  info="Simple shows chat only. Builder adds configuration panels. Full exposes every enabled capability."
                >
                  <Select
                    value={sandbox.mode}
                    onChange={(event) =>
                      update({ mode: event.target.value as AgentSandboxConfig["mode"] })
                    }
                  >
                    <option value="simple">Simple</option>
                    <option value="builder">Builder</option>
                    <option value="full">Full</option>
                  </Select>
                </Field>
              </FieldGrid>
              <Field label="Brief" info="The task learners complete in the sandbox.">
                <Textarea rows={3} value={sandbox.brief || ""} onChange={(event) => update({ brief: event.target.value })} />
              </Field>
            </Card>
          ) : null}

          {section === "screens" ? (
            <div className="space-y-4">
              <IntroEditor sandbox={sandbox} update={update} />
              <CompletionEditor sandbox={sandbox} update={update} />
            </div>
          ) : null}

          {section === "capabilities" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <SectionTitle title="Visible to learners" />
                <CheckboxGrid
                  items={sandboxCapabilities}
                  selected={sandbox.capabilities || []}
                  onChange={(capabilities) => update({ capabilities })}
                />
              </Card>
              <Card>
                <SectionTitle title="Required to complete" />
                <CheckboxGrid
                  items={sandboxCapabilities.filter((item) => item !== "credits")}
                  selected={sandbox.requiredCapabilities || []}
                  onChange={(requiredCapabilities) => update({ requiredCapabilities })}
                />
              </Card>
            </div>
          ) : null}

          {section === "agent" ? (
            <Card className="space-y-4">
              <FieldGrid>
                <Field label="Agent name">
                  <Input
                    value={sandbox.starterAgent?.name || ""}
                    onChange={(event) =>
                      update({ starterAgent: { ...sandbox.starterAgent, name: event.target.value } })
                    }
                  />
                </Field>
                <Field label="Role">
                  <Input
                    value={sandbox.starterAgent?.persona || ""}
                    onChange={(event) =>
                      update({ starterAgent: { ...sandbox.starterAgent, persona: event.target.value } })
                    }
                  />
                </Field>
              </FieldGrid>
              <Field label="System prompt">
                <Textarea
                  rows={6}
                  value={sandbox.starterAgent?.systemPrompt || ""}
                  onChange={(event) =>
                    update({
                      starterAgent: { ...sandbox.starterAgent, systemPrompt: event.target.value },
                    })
                  }
                />
              </Field>
            </Card>
          ) : null}

          {section === "templates" ? (
            <div className="space-y-4">
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
            </div>
          ) : null}

          {section === "review" ? (
            <ReviewEditor value={sandbox.review} onChange={(review) => update({ review })} />
          ) : null}

          {section === "guide" ? (
            <GuideStepEditor
              steps={sandbox.guideSteps || []}
              onChange={(guideSteps) => update({ guideSteps })}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function IntroEditor({ sandbox, update }: { sandbox: AgentSandboxConfig; update: Update }) {
  const intro = sandbox.intro;
  const setIntro = (patch: Partial<NonNullable<AgentSandboxConfig["intro"]>>) =>
    update({ intro: { ...intro, enabled: true, ...patch } });
  return (
    <Card className="space-y-4">
      <SwitchRow
        label="Intro screen"
        info="Explains the task before learners enter the sandbox."
        checked={Boolean(intro?.enabled)}
        onChange={(enabled) => update({ intro: { ...intro, enabled } })}
      />
      <FieldGrid>
        <Field label="Title">
          <Input value={intro?.title || ""} onChange={(event) => setIntro({ title: event.target.value })} />
        </Field>
        <Field label="Start button">
          <Input value={intro?.startLabel || ""} onChange={(event) => setIntro({ startLabel: event.target.value })} />
        </Field>
      </FieldGrid>
      <Field label="Body">
        <Textarea rows={3} value={intro?.body || ""} onChange={(event) => setIntro({ body: event.target.value })} />
      </Field>
      <Field label="Expectations" info="One per line.">
        <Textarea
          rows={3}
          value={(intro?.expectations || []).join("\n")}
          onChange={(event) =>
            setIntro({
              expectations: event.target.value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      </Field>
      <Disclosure title="Info panel" summary={intro?.infoTitle || "Optional"}>
        <div className="space-y-4">
          <Field label="Info title">
            <Input value={intro?.infoTitle || ""} onChange={(event) => setIntro({ infoTitle: event.target.value })} />
          </Field>
          <Field label="Info body">
            <Textarea rows={3} value={intro?.infoBody || ""} onChange={(event) => setIntro({ infoBody: event.target.value })} />
          </Field>
        </div>
      </Disclosure>
    </Card>
  );
}

function CompletionEditor({ sandbox, update }: { sandbox: AgentSandboxConfig; update: Update }) {
  const completion = sandbox.completion;
  return (
    <Card className="space-y-4">
      <SectionTitle title="Completion screen" />
      <FieldGrid>
        <Field label="Title">
          <Input
            value={completion?.title || ""}
            onChange={(event) => update({ completion: { ...completion, title: event.target.value } })}
          />
        </Field>
        <Field label="Continue button">
          <Input
            value={completion?.primaryActionLabel || ""}
            onChange={(event) =>
              update({ completion: { ...completion, primaryActionLabel: event.target.value } })
            }
          />
        </Field>
      </FieldGrid>
      <Field label="Body">
        <Textarea
          rows={3}
          value={completion?.body || ""}
          onChange={(event) => update({ completion: { ...completion, body: event.target.value } })}
        />
      </Field>
    </Card>
  );
}

function ReviewEditor({
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
    <Card className="space-y-4">
      <SwitchRow
        label="AI reviewer"
        info="Gives learners quiz-like feedback on prompts or skills before they create the agent."
        checked={Boolean(review.enabled)}
        onChange={(enabled) => onChange({ ...review, enabled })}
      />
      {review.enabled ? (
        <>
          <div>
            <p className="mb-1.5 text-sm font-medium">Review targets</p>
            <CheckboxGrid
              items={["system_prompt", "skills"]}
              selected={review.targets || []}
              onChange={(targets) => onChange({ ...review, targets })}
            />
          </div>
          <FieldGrid>
            <Field label="Passing score">
              <Input
                type="number"
                value={String(review.minScore || 70)}
                onChange={(event) => onChange({ ...review, minScore: Number(event.target.value) || 70 })}
              />
            </Field>
            <Field label="Review model" optional>
              <Input value={review.model || ""} onChange={(event) => onChange({ ...review, model: event.target.value })} />
            </Field>
          </FieldGrid>
          <Field label="Rubric">
            <Textarea rows={4} value={review.rubric || ""} onChange={(event) => onChange({ ...review, rubric: event.target.value })} />
          </Field>
        </>
      ) : null}
    </Card>
  );
}

function CheckboxGrid<T extends string>({
  items,
  selected,
  onChange,
}: {
  items: T[];
  selected: T[];
  onChange: (items: T[]) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {items.map((item) => {
        const checked = selected.includes(item);
        return (
          <label
            key={item}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm capitalize transition-colors hover:bg-muted",
              checked ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-stone-900"
              checked={checked}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? Array.from(new Set([...selected, item]))
                    : selected.filter((value) => value !== item),
                )
              }
            />
            {item.replace(/_/g, " ")}
          </label>
        );
      })}
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
  function setRow(index: number, row: SandboxTemplate) {
    const next = [...rows];
    next[index] = row;
    onChange(next);
  }
  return (
    <div>
      <SectionTitle
        title={title}
        action={
          <Button
            size="sm"
            icon={Plus}
            onClick={() =>
              onChange([
                ...rows,
                kind === "skill"
                  ? { id: `skill-${rows.length + 1}`, name: "New skill", instructions: "" }
                  : {
                      id: `tool-${rows.length + 1}`,
                      name: "New tool",
                      description: "",
                      connectorKind: "custom",
                      simulated: true,
                    },
              ])
            }
          >
            Add
          </Button>
        }
      />
      <div className="space-y-2">
        {rows.map((row, index) => (
          <Disclosure key={row.id || index} title={row.name || "Untitled"} defaultOpen={!row.name}>
            <div className="space-y-4">
              <FieldGrid>
                <Field label="Name">
                  <Input value={row.name || ""} onChange={(event) => setRow(index, { ...row, name: event.target.value })} />
                </Field>
                {kind === "tool" ? (
                  <Field label="Connector">
                    <Select
                      value={"connectorKind" in row ? row.connectorKind || "custom" : "custom"}
                      onChange={(event) =>
                        setRow(index, {
                          ...row,
                          connectorKind: event.target.value as SandboxToolTemplate["connectorKind"],
                        })
                      }
                    >
                      <option value="custom">Custom</option>
                      <option value="google_calendar">Google Calendar</option>
                      <option value="gmail">Gmail</option>
                      <option value="google_drive">Google Drive</option>
                      <option value="google_sheets">Google Sheets</option>
                      <option value="github">GitHub</option>
                    </Select>
                  </Field>
                ) : null}
              </FieldGrid>
              <Field label={kind === "skill" ? "Instructions" : "Description"}>
                <Textarea
                  rows={3}
                  value={
                    kind === "skill"
                      ? "instructions" in row
                        ? row.instructions || ""
                        : ""
                      : "description" in row
                        ? row.description || ""
                        : ""
                  }
                  onChange={(event) =>
                    setRow(
                      index,
                      kind === "skill"
                        ? { ...row, instructions: event.target.value }
                        : { ...row, description: event.target.value },
                    )
                  }
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                >
                  Remove
                </Button>
              </div>
            </div>
          </Disclosure>
        ))}
        {!rows.length ? <EmptyState title={`No ${title.toLowerCase()}`} className="py-8" /> : null}
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
  function setStep(index: number, patch: Partial<AgentSandboxConfig["guideSteps"][number]>) {
    const next = [...steps];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }
  return (
    <div>
      <SectionTitle
        title="Guided highlights"
        info="Short tour steps that point learners at parts of the sandbox."
        action={
          <Button
            size="sm"
            icon={Plus}
            onClick={() =>
              onChange([
                ...steps,
                { id: `step-${steps.length + 1}`, target: "identity", title: "New step", body: "" },
              ])
            }
          >
            Add step
          </Button>
        }
      />
      <div className="space-y-2">
        {steps.map((step, index) => (
          <Disclosure
            key={step.id || index}
            title={`${index + 1}. ${step.title || "Untitled step"}`}
            summary={step.target.replace(/_/g, " ")}
          >
            <div className="space-y-4">
              <FieldGrid columns={3}>
                <Field label="Title">
                  <Input value={step.title} onChange={(event) => setStep(index, { title: event.target.value })} />
                </Field>
                <Field label="Target">
                  <Select
                    value={step.target}
                    onChange={(event) => setStep(index, { target: event.target.value as AgentSandboxStepTarget })}
                  >
                    {sandboxTargets.map((target) => (
                      <option key={target} value={target}>
                        {target.replace(/_/g, " ")}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Dialog side">
                  <Select
                    value={step.placement || "auto"}
                    onChange={(event) =>
                      setStep(index, {
                        placement: event.target.value as NonNullable<typeof step.placement>,
                      })
                    }
                  >
                    {["auto", "top", "right", "bottom", "left"].map((placement) => (
                      <option key={placement} value={placement}>
                        {placement}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldGrid>
              <Field label="Instruction">
                <Textarea rows={2} value={step.body} onChange={(event) => setStep(index, { body: event.target.value })} />
              </Field>
              <Field label="Custom selector" optional info="A CSS selector or [data-sandbox-target] value.">
                <Input
                  value={step.targetSelector || ""}
                  onChange={(event) => setStep(index, { targetSelector: event.target.value })}
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => onChange(steps.filter((_, stepIndex) => stepIndex !== index))}
                >
                  Remove step
                </Button>
              </div>
            </div>
          </Disclosure>
        ))}
        {!steps.length ? <EmptyState title="No guide steps" className="py-8" /> : null}
      </div>
    </div>
  );
}
