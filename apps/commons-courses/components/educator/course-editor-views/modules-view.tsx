"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, FileText, Folder, Plus, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/educator/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid, Input, Select, SwitchRow } from "@/components/ui/field";
import { Badge, Card, Disclosure, EmptyState, NavItem, SectionTitle } from "@/components/ui/surface";
import type { LabWorkspaceRecord } from "@/types/lab-workspace";
import type { CourseViewProps, Lesson, Module } from "./types";

type Selection = { module: number; lesson?: number };

function useSelection(moduleCount: number) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const moduleParam = Number(searchParams.get("module"));
  const lessonParam = searchParams.get("lesson");
  const selection: Selection = {
    module: Number.isInteger(moduleParam) && moduleParam >= 0 && moduleParam < moduleCount ? moduleParam : 0,
    lesson: lessonParam === null || lessonParam === "" ? undefined : Number(lessonParam),
  };
  const select = useCallback(
    (next: Selection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("module", String(next.module));
      if (next.lesson === undefined) params.delete("lesson");
      else params.set("lesson", String(next.lesson));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  return [selection, select] as const;
}

export function ModulesView({
  course,
  setCourse,
  labWorkspaces,
  onNotice,
}: Pick<CourseViewProps, "course" | "setCourse"> & {
  labWorkspaces: LabWorkspaceRecord[];
  onNotice: (title: string) => void;
}) {
  const modules = course.modules;
  const [selection, select] = useSelection(modules.length);
  const currentModule = modules[selection.module];
  const currentLesson =
    selection.lesson !== undefined ? currentModule?.lessons[selection.lesson] : undefined;

  function setModules(next: Module[]) {
    setCourse((current) => ({ ...current, modules: next }));
  }

  function updateModule(index: number, patch: Partial<Module>) {
    setModules(modules.map((module, i) => (i === index ? { ...module, ...patch } : module)));
  }

  function updateLesson(moduleIndex: number, lessonIndex: number, patch: Partial<Lesson>) {
    const target = modules[moduleIndex];
    updateModule(moduleIndex, {
      lessons: target.lessons.map((lesson, i) => (i === lessonIndex ? { ...lesson, ...patch } : lesson)),
    });
  }

  function addModule() {
    const next = [...modules, { title: `Module ${modules.length + 1}`, lessons: [] }];
    setModules(next);
    select({ module: next.length - 1 });
    onNotice("Module added");
  }

  function addLesson(moduleIndex: number) {
    const target = modules[moduleIndex];
    const lessons = [...target.lessons, { title: "New lesson", duration: "15" }];
    updateModule(moduleIndex, { lessons });
    select({ module: moduleIndex, lesson: lessons.length - 1 });
    onNotice("Lesson added");
  }

  function removeModule(index: number) {
    if (!window.confirm("Remove this module and its lessons?")) return;
    setModules(modules.filter((_, i) => i !== index));
    select({ module: Math.max(0, index - 1) });
    onNotice("Module removed");
  }

  function removeLesson(moduleIndex: number, lessonIndex: number) {
    const target = modules[moduleIndex];
    updateModule(moduleIndex, { lessons: target.lessons.filter((_, i) => i !== lessonIndex) });
    select({ module: moduleIndex });
    onNotice("Lesson removed");
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-border bg-white p-2 shadow-card lg:sticky lg:top-0">
        <div className="max-h-[calc(100dvh-16rem)] space-y-0.5 overflow-y-auto">
          {modules.map((module, moduleIndex) => {
            const open = moduleIndex === selection.module;
            return (
              <div key={moduleIndex}>
                <NavItem
                  active={open && selection.lesson === undefined}
                  onClick={() => select({ module: moduleIndex })}
                  leading={
                    open ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                    )
                  }
                  title={module.title || `Module ${moduleIndex + 1}`}
                  trailing={
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {module.lessons.length}
                    </span>
                  }
                />
                {open ? (
                  <div className="space-y-0.5 pb-1">
                    {module.lessons.map((lesson, lessonIndex) => (
                      <NavItem
                        key={lessonIndex}
                        indent
                        active={selection.lesson === lessonIndex}
                        onClick={() => select({ module: moduleIndex, lesson: lessonIndex })}
                        title={lesson.title || `Lesson ${lessonIndex + 1}`}
                        trailing={
                          lesson.isFree ? (
                            <span className="text-[10px] font-medium text-emerald-600">Free</span>
                          ) : null
                        }
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => addLesson(moduleIndex)}
                      className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-7 pr-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Add lesson
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-1 border-t border-border pt-1">
          <button
            type="button"
            onClick={addModule}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add module
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {!currentModule ? (
          <EmptyState
            icon={Folder}
            title="No modules yet"
            action={
              <Button variant="primary" icon={Plus} onClick={addModule}>
                Add module
              </Button>
            }
          />
        ) : currentLesson && selection.lesson !== undefined ? (
          <LessonEditor
            key={`${selection.module}-${selection.lesson}`}
            moduleTitle={currentModule.title}
            lesson={currentLesson}
            labWorkspaces={labWorkspaces}
            onBack={() => select({ module: selection.module })}
            onChange={(patch) => updateLesson(selection.module, selection.lesson!, patch)}
            onRemove={() => removeLesson(selection.module, selection.lesson!)}
          />
        ) : (
          <ModuleEditor
            key={selection.module}
            index={selection.module}
            module={currentModule}
            onChange={(patch) => updateModule(selection.module, patch)}
            onRemove={() => removeModule(selection.module)}
            onOpenLesson={(lesson) => select({ module: selection.module, lesson })}
            onAddLesson={() => addLesson(selection.module)}
          />
        )}
      </div>
    </div>
  );
}

function ModuleEditor({
  index,
  module,
  onChange,
  onRemove,
  onOpenLesson,
  onAddLesson,
}: {
  index: number;
  module: Module;
  onChange: (patch: Partial<Module>) => void;
  onRemove: () => void;
  onOpenLesson: (lesson: number) => void;
  onAddLesson: () => void;
}) {
  return (
    <div className="space-y-5">
      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Badge>Module {index + 1}</Badge>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove}>
            Remove module
          </Button>
        </div>
        <Field label="Module title">
          <Input value={module.title} onChange={(event) => onChange({ title: event.target.value })} />
        </Field>
        <RichTextEditor
          label="Description"
          value={module.description || ""}
          onChange={(description) => onChange({ description })}
        />
      </Card>

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <SectionTitle title="Lessons" className="mb-0" />
          <Button size="sm" icon={Plus} onClick={onAddLesson}>
            Add lesson
          </Button>
        </div>
        {module.lessons.length ? (
          <div className="divide-y divide-border">
            {module.lessons.map((lesson, lessonIndex) => (
              <button
                key={lessonIndex}
                type="button"
                onClick={() => onOpenLesson(lessonIndex)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-page"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate text-sm">{lesson.title || "Untitled lesson"}</span>
                {lesson.isFree ? <Badge tone="success">Free preview</Badge> : null}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {lesson.duration ? `${lesson.duration} min` : ""}
                </span>
                <ChevronRight className="h-4 w-4 text-stone-300" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No lessons in this module yet.</p>
        )}
      </Card>

      <Disclosure
        title="Module assignment prompt"
        summary={module.assignment ? "Prompt added" : "Optional"}
      >
        <RichTextEditor
          label="Prompt"
          value={module.assignment || ""}
          onChange={(assignment) => onChange({ assignment })}
        />
      </Disclosure>
    </div>
  );
}

function LessonEditor({
  moduleTitle,
  lesson,
  labWorkspaces,
  onBack,
  onChange,
  onRemove,
}: {
  moduleTitle: string;
  lesson: Lesson;
  labWorkspaces: LabWorkspaceRecord[];
  onBack: () => void;
  onChange: (patch: Partial<Lesson>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-w-0 truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {moduleTitle} <span className="px-1 text-stone-300">/</span>
          <span className="text-foreground">{lesson.title || "Lesson"}</span>
        </button>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove}>
          Remove lesson
        </Button>
      </div>

      <Card className="space-y-5">
        <FieldGrid>
          <Field label="Lesson title" className="sm:col-span-2">
            <Input value={lesson.title} onChange={(event) => onChange({ title: event.target.value })} />
          </Field>
          <Field label="Duration (minutes)">
            <Input value={lesson.duration} onChange={(event) => onChange({ duration: event.target.value })} />
          </Field>
        </FieldGrid>
        <div className="border-y border-border">
          <SwitchRow
            label="Free preview"
            info="Anyone can open this lesson from the course page before enrolling."
            checked={Boolean(lesson.isFree)}
            onChange={(isFree) => onChange({ isFree })}
          />
        </div>
        <RichTextEditor
          label="Lesson content"
          value={lesson.description || ""}
          onChange={(description) => onChange({ description })}
        />
      </Card>

      <Disclosure
        title="Resources"
        summary={
          [lesson.assetUrl ? "Asset linked" : null, lesson.labWorkspaceId ? "Lab attached" : null]
            .filter(Boolean)
            .join(" · ") || "Optional asset and lab workspace"
        }
      >
        <div className="space-y-4">
          <FieldGrid>
            <Field label="Asset link">
              <Input
                type="url"
                placeholder="https://"
                value={lesson.assetUrl || ""}
                onChange={(event) => onChange({ assetUrl: event.target.value })}
              />
            </Field>
            <Field label="Asset alt text">
              <Input value={lesson.assetAlt || ""} onChange={(event) => onChange({ assetAlt: event.target.value })} />
            </Field>
          </FieldGrid>
          <Field label="Lab workspace" info="Learners open this workspace from the lesson.">
            <Select
              value={lesson.labWorkspaceId || ""}
              onChange={(event) => onChange({ labWorkspaceId: event.target.value || undefined })}
            >
              <option value="">No lab</option>
              {labWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Disclosure>
    </div>
  );
}
