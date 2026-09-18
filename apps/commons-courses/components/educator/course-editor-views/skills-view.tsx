"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Award, Check, ChevronsUpDown, Plus, Settings2, Trash2 } from "lucide-react";
import { ColorPicker } from "@/components/color-picker";
import { RichTextEditor } from "@/components/educator/rich-text-editor";
import { SandboxConfigEditor } from "@/components/educator/sandbox-config-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid, Input, SwitchRow, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { Badge, Card, Disclosure, EmptyState, IndexChip, NavItem } from "@/components/ui/surface";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { SkillChallenge, SkillPack, SkillQuestion } from "@/types/skills";
import { MediaField } from "./media-field";
import type { CourseViewProps, UploadField } from "./types";

const CHALLENGE_TABS = ["basics", "lesson", "quiz", "sandbox"] as const;
type ChallengeTab = (typeof CHALLENGE_TABS)[number];

type PathRef = { key: string; label: string; pack: SkillPack; packIndex?: number };

function readSelection(searchParams: URLSearchParams | { get(key: string): string | null }) {
  const tabParam = searchParams.get("view") as ChallengeTab | null;
  return {
    path: searchParams.get("path") || "primary",
    item: searchParams.get("item") || "settings",
    tab: tabParam && CHALLENGE_TABS.includes(tabParam) ? tabParam : ("basics" as ChallengeTab),
  };
}

function useSkillSelection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = readSelection(searchParams);
  const set = useCallback(
    (next: Partial<ReturnType<typeof readSelection>>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...readSelection(searchParams), ...next };
      params.set("path", merged.path);
      params.set("item", merged.item);
      if (merged.tab === "basics") params.delete("view");
      else params.set("view", merged.tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  return [state, set] as const;
}

export function SkillsView({
  course,
  setCourse,
  uploadingMedia,
  uploadMedia,
  onNotice,
}: CourseViewProps & { onNotice: (title: string) => void }) {
  const [selection, select] = useSkillSelection();
  const paths: PathRef[] = [
    { key: "primary", label: "Primary path", pack: course.skillPack },
    ...course.skillPacks.map((pack, index) => ({
      key: `pack-${index}`,
      label: `Path ${index + 2}`,
      pack,
      packIndex: index,
    })),
  ];
  const current = paths.find((path) => path.key === selection.path) || paths[0];
  const challenges = current.pack.challenges || [];
  const challengeIndex = selection.item === "settings" ? -1 : Number(selection.item);
  const challenge = challengeIndex >= 0 ? challenges[challengeIndex] : undefined;
  const uploadPrefix = current.packIndex === undefined ? "skillPack" : `skillPacks.${current.packIndex}`;

  function updatePack(pack: SkillPack) {
    setCourse((course) => {
      if (current.packIndex === undefined) return { ...course, skillPack: pack };
      const skillPacks = [...course.skillPacks];
      skillPacks[current.packIndex] = pack;
      return { ...course, skillPacks };
    });
  }

  function updateChallenge(index: number, patch: Partial<SkillChallenge>) {
    const next = [...challenges];
    next[index] = { ...next[index], ...patch, day: index + 1 };
    updatePack({ ...current.pack, challenges: next });
  }

  function addPath() {
    const index = course.skillPacks.length;
    setCourse((course) => ({
      ...course,
      skillPacks: [...course.skillPacks, createSkillPack(index + 1)],
    }));
    select({ path: `pack-${index}`, item: "settings", tab: "basics" });
    onNotice("Skill path added");
  }

  function removePath() {
    if (current.packIndex === undefined) return;
    if (!window.confirm("Remove this skill path?")) return;
    const removeIndex = current.packIndex;
    setCourse((course) => ({
      ...course,
      skillPacks: course.skillPacks.filter((_, index) => index !== removeIndex),
    }));
    select({ path: "primary", item: "settings", tab: "basics" });
    onNotice("Skill path removed");
  }

  function addChallenge() {
    const next = [...challenges, createSkillChallenge(challenges.length)];
    updatePack({ ...current.pack, challenges: next });
    select({ item: String(next.length - 1), tab: "basics" });
  }

  function removeChallenge(index: number) {
    if (!window.confirm("Remove this challenge?")) return;
    updatePack({ ...current.pack, challenges: challenges.filter((_, i) => i !== index) });
    select({ item: "settings", tab: "basics" });
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-2 lg:sticky lg:top-0">
        <Popover
          className="w-[280px] p-1.5"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="flex w-[280px] items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5 text-left shadow-card transition-colors hover:bg-muted"
            >
              <Award className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {current.pack.title || "Untitled skill path"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {current.label} · {current.pack.enabled ? "Published" : "Draft"}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            </button>
          )}
        >
          {({ close }) => (
            <div>
              {paths.map((path) => (
                <button
                  key={path.key}
                  type="button"
                  onClick={() => {
                    select({ path: path.key, item: "settings", tab: "basics" });
                    close();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{path.pack.title || "Untitled skill path"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {(path.pack.challenges || []).length} challenges
                    </span>
                  </span>
                  {path.key === current.key ? <Check className="h-4 w-4" strokeWidth={1.75} /> : null}
                </button>
              ))}
              <div className="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => {
                    addPath();
                    close();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-stone-600 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  New skill path
                </button>
              </div>
            </div>
          )}
        </Popover>

        <div className="rounded-xl border border-border bg-white p-2 shadow-card">
          <NavItem
            active={selection.item === "settings"}
            onClick={() => select({ item: "settings", tab: "basics" })}
            leading={<Settings2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
            title="Path settings"
          />
          <p className="px-2.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">Daily challenges</p>
          <div className="max-h-[calc(100dvh-24rem)] space-y-0.5 overflow-y-auto">
            {challenges.map((item, index) => (
              <NavItem
                key={item.id || index}
                active={challengeIndex === index}
                onClick={() => select({ item: String(index) })}
                leading={<IndexChip value={index + 1} active={challengeIndex === index} />}
                title={item.title || `Day ${index + 1}`}
                meta={`${item.minutes || 5} min · ${(item.questions || []).length} questions`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addChallenge}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add challenge
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {selection.item === "settings" ? (
          <PathSettings
            pack={current.pack}
            removable={current.packIndex !== undefined}
            uploading={uploadingMedia === `${uploadPrefix}.coverUrl`}
            onChange={updatePack}
            onUploadCover={(file) => uploadMedia(`${uploadPrefix}.coverUrl` as UploadField, file)}
            onRemove={removePath}
          />
        ) : challenge ? (
          <ChallengeEditor
            key={`${current.key}-${challengeIndex}`}
            index={challengeIndex}
            challenge={challenge}
            tab={selection.tab}
            onTab={(tab) => select({ tab })}
            uploading={uploadingMedia === `${uploadPrefix}.${challengeIndex}.assetUrl`}
            onUpload={(file) =>
              uploadMedia(`${uploadPrefix}.${challengeIndex}.assetUrl` as UploadField, file)
            }
            onChange={(patch) => updateChallenge(challengeIndex, patch)}
            onRemove={() => removeChallenge(challengeIndex)}
          />
        ) : (
          <EmptyState
            icon={Award}
            title="Pick a challenge"
            action={
              <Button icon={Plus} onClick={addChallenge}>
                Add challenge
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

function PathSettings({
  pack,
  removable,
  uploading,
  onChange,
  onUploadCover,
  onRemove,
}: {
  pack: SkillPack;
  removable: boolean;
  uploading: boolean;
  onChange: (pack: SkillPack) => void;
  onUploadCover: (file?: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-5">
      <Card className="divide-y divide-border py-2">
        <SwitchRow
          label="Publish this skill path"
          info="Published paths appear on the Skills page once the course is published. Completing every challenge earns the badge."
          checked={pack.enabled}
          onChange={(enabled) => onChange({ ...pack, enabled })}
        />
      </Card>
      <Card className="space-y-5">
        <FieldGrid>
          <Field label="Title">
            <Input value={pack.title || ""} onChange={(event) => onChange({ ...pack, title: event.target.value })} />
          </Field>
          <Field label="Subtitle" optional>
            <Input
              value={pack.subtitle || ""}
              onChange={(event) => onChange({ ...pack, subtitle: event.target.value })}
            />
          </Field>
        </FieldGrid>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
          <RichTextEditor
            label="Learner promise"
            value={pack.learnerPromise || ""}
            onChange={(learnerPromise) => onChange({ ...pack, learnerPromise })}
          />
          <MediaField
            label="Featured image"
            info="Used for social previews before any challenge image."
            value={pack.coverUrl || ""}
            onChange={(coverUrl) => onChange({ ...pack, coverUrl })}
            onUpload={onUploadCover}
            uploading={uploading}
          />
        </div>
      </Card>
      {removable ? (
        <div className="flex justify-end">
          <Button variant="danger" size="sm" icon={Trash2} onClick={onRemove}>
            Remove skill path
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ChallengeEditor({
  index,
  challenge,
  tab,
  onTab,
  uploading,
  onUpload,
  onChange,
  onRemove,
}: {
  index: number;
  challenge: SkillChallenge;
  tab: ChallengeTab;
  onTab: (tab: ChallengeTab) => void;
  uploading: boolean;
  onUpload: (file?: File) => void;
  onChange: (patch: Partial<SkillChallenge>) => void;
  onRemove: () => void;
}) {
  const questions = challenge.questions || [];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge>Day {index + 1}</Badge>
          <h2 className="truncate text-base font-medium">{challenge.title || "Untitled challenge"}</h2>
        </div>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <Tabs
        className="mb-5"
        value={tab}
        onChange={onTab}
        items={[
          { value: "basics", label: "Basics" },
          { value: "lesson", label: "Lesson" },
          { value: "quiz", label: "Quiz", count: questions.length },
          { value: "sandbox", label: "Sandbox" },
        ]}
      />

      {tab === "basics" ? (
        <Card className="space-y-5">
          <FieldGrid>
            <Field label="Title">
              <Input value={challenge.title} onChange={(event) => onChange({ title: event.target.value })} />
            </Field>
            <Field label="Short title" optional>
              <Input
                value={challenge.shortTitle || ""}
                onChange={(event) => onChange({ shortTitle: event.target.value })}
              />
            </Field>
            <Field label="Minutes">
              <Input
                type="number"
                min={1}
                value={String(challenge.minutes || 5)}
                onChange={(event) => onChange({ minutes: Number(event.target.value) || 5 })}
              />
            </Field>
            <Field label="Points">
              <Input
                type="number"
                min={0}
                value={String(challenge.points || 50)}
                onChange={(event) => onChange({ points: Number(event.target.value) || 50 })}
              />
            </Field>
          </FieldGrid>
          <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
            <MediaField
              label="Image"
              value={challenge.assetUrl || ""}
              onChange={(assetUrl) => onChange({ assetUrl })}
              onUpload={onUpload}
              uploading={uploading}
            />
            <div className="space-y-4">
              <Field label="Image alt text" optional>
                <Input
                  value={challenge.assetAlt || ""}
                  onChange={(event) => onChange({ assetAlt: event.target.value })}
                />
              </Field>
              <ColorPicker
                label="Accent"
                value={challenge.accentColor || "#B8F56D"}
                onChange={(accentColor) => onChange({ accentColor })}
              />
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "lesson" ? (
        <Card className="space-y-5">
          <Field label="Hook" info="One or two sentences that open the challenge.">
            <Textarea rows={2} value={challenge.hook || ""} onChange={(event) => onChange({ hook: event.target.value })} />
          </Field>
          <RichTextEditor
            label="Lesson"
            value={challenge.lesson}
            onChange={(lesson) => onChange({ lesson })}
          />
          <Field label="Key ideas" info="One idea per line.">
            <Textarea
              rows={3}
              value={(challenge.keyIdeas || []).join("\n")}
              onChange={(event) =>
                onChange({
                  keyIdeas: event.target.value
                    .split(/\n|,/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </Card>
      ) : null}

      {tab === "quiz" ? (
        <div className="space-y-3">
          {questions.map((question, questionIndex) => (
            <Disclosure
              key={question.id || questionIndex}
              title={question.prompt || `Question ${questionIndex + 1}`}
              summary={`${question.options.filter(Boolean).length} options`}
              defaultOpen={!question.prompt}
            >
              <QuestionEditor
                question={question}
                onChange={(next) =>
                  onChange({
                    questions: questions.map((item, i) => (i === questionIndex ? next : item)),
                  })
                }
                onRemove={() =>
                  onChange({ questions: questions.filter((_, i) => i !== questionIndex) })
                }
              />
            </Disclosure>
          ))}
          {!questions.length ? (
            <EmptyState title="No questions yet" className="py-10" />
          ) : null}
          <Button
            icon={Plus}
            onClick={() =>
              onChange({ questions: [...questions, createSkillQuestion(questions.length)] })
            }
          >
            Add question
          </Button>
        </div>
      ) : null}

      {tab === "sandbox" ? (
        <SandboxConfigEditor
          value={challenge.sandbox}
          onChange={(sandbox) => onChange({ sandbox })}
        />
      ) : null}
    </div>
  );
}

function QuestionEditor({
  question,
  onChange,
  onRemove,
}: {
  question: SkillQuestion;
  onChange: (question: SkillQuestion) => void;
  onRemove: () => void;
}) {
  const options = question.options.length ? question.options : ["", ""];
  return (
    <div className="space-y-4">
      <Field label="Question">
        <Input value={question.prompt} onChange={(event) => onChange({ ...question, prompt: event.target.value })} />
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-medium">Options</p>
        <div className="space-y-2">
          {options.map((option, optionIndex) => {
            const correct = question.answerIndex === optionIndex;
            return (
              <div key={optionIndex} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...question, answerIndex: optionIndex })}
                  aria-label={`Mark option ${optionIndex + 1} correct`}
                  title="Mark as the correct answer"
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    correct
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-border text-stone-300 hover:text-stone-500",
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={2} />
                </button>
                <Input
                  value={option}
                  placeholder={`Option ${optionIndex + 1}`}
                  onChange={(event) => {
                    const next = [...options];
                    next[optionIndex] = event.target.value;
                    onChange({ ...question, options: next });
                  }}
                />
                {options.length > 2 ? (
                  <button
                    type="button"
                    aria-label="Remove option"
                    onClick={() =>
                      onChange({
                        ...question,
                        options: options.filter((_, i) => i !== optionIndex),
                        answerIndex:
                          question.answerIndex > optionIndex
                            ? question.answerIndex - 1
                            : Math.min(question.answerIndex, options.length - 2),
                      })
                    }
                    className="rounded-md p-2 text-stone-300 transition-colors hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          className="mt-2"
          onClick={() => onChange({ ...question, options: [...options, ""] })}
        >
          Add option
        </Button>
      </div>
      <Field label="Explanation" optional info="Shown after the learner answers.">
        <Textarea
          rows={2}
          value={question.explanation || ""}
          onChange={(event) => onChange({ ...question, explanation: event.target.value })}
        />
      </Field>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove}>
          Remove question
        </Button>
      </div>
    </div>
  );
}

function createSkillChallenge(index: number): SkillChallenge {
  return {
    id: `day-${index + 1}`,
    day: index + 1,
    title: `Day ${index + 1}`,
    shortTitle: "",
    minutes: 6,
    points: 60,
    streakBoost: 1,
    assetUrl: "",
    assetAlt: "",
    accentColor: "#B8F56D",
    audioCue: "focus",
    hook: "",
    lesson: "",
    keyIdeas: [],
    questions: [createSkillQuestion(0)],
  };
}

function createSkillPack(index: number): SkillPack {
  return {
    slug: `skill-path-${index + 1}`,
    enabled: false,
    title: `Skill path ${index + 1}`,
    subtitle: "",
    coverUrl: "",
    learnerPromise: "",
    challenges: [createSkillChallenge(0)],
  };
}

function createSkillQuestion(index: number): SkillQuestion {
  return {
    id: `q${index + 1}`,
    prompt: "",
    options: ["", ""],
    answerIndex: 0,
    explanation: "",
  };
}
