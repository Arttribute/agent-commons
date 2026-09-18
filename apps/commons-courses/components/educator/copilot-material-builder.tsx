"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Check, FileText, FileUp, Layers3, Sparkles } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type MaterialMode = "course" | "workbook" | "skill_path";

type ManagedCourse = {
  title: string;
  slug: string;
};

type CopilotResult = {
  mode: MaterialMode;
  course: {
    title: string;
    slug: string;
    href: string;
  };
  skillPath?: {
    title: string;
    slug: string;
    href: string;
  };
  notes?: string[];
};

const MATERIAL_MODES = [
  {
    value: "course" as const,
    title: "Course",
    description: "Modules, lessons, activities, and assessment",
    icon: BookOpen,
  },
  {
    value: "workbook" as const,
    title: "Workbook",
    description: "Guided explanations, exercises, and reflection",
    icon: FileText,
  },
  {
    value: "skill_path" as const,
    title: "Skill pack",
    description: "Focused challenges for an existing course",
    icon: Layers3,
  },
];

export function CopilotMaterialBuilder({
  courses,
}: {
  courses: ManagedCourse[];
}) {
  const [mode, setMode] = useState<MaterialMode>("course");
  const [targetCourseSlug, setTargetCourseSlug] = useState(courses[0]?.slug || "");
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CopilotResult | null>(null);

  const canSubmit = useMemo(
    () =>
      files.length > 0 &&
      !submitting &&
      (mode !== "skill_path" || Boolean(targetCourseSlug)),
    [files.length, mode, submitting, targetCourseSlug]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("instructions", instructions);
    if (mode === "skill_path") formData.set("targetCourseSlug", targetCourseSlug);
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/educator/copilot/materials", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      setError(payload.error || "Could not create the draft yet.");
      return;
    }

    setResult(payload as CopilotResult);
    setFiles([]);
  }

  return (
    <div className="space-y-5">
      {result ? (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" strokeWidth={2} />
            <p className="text-sm font-medium">
              {result.mode === "skill_path"
                ? `Added ${result.skillPath?.title || "the skill path"} to ${result.course.title}`
                : `Draft created: ${result.course.title}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={result.course.href} size="sm" icon={ArrowRight}>
              Open course draft
            </ButtonLink>
            {result.mode === "skill_path" && result.skillPath ? (
              <ButtonLink href={result.skillPath.href} size="sm" icon={ArrowRight}>
                Open skill path
              </ButtonLink>
            ) : null}
          </div>
          {result.notes?.length ? (
            <div className="space-y-1 text-xs leading-5 text-muted-foreground">
              {result.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <form onSubmit={submit}>
        <Card className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm font-medium">Format</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {MATERIAL_MODES.map((option) => {
                const Icon = option.icon;
                const selected = mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMode(option.value)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      selected ? "border-stone-900 bg-white shadow-card" : "border-border hover:bg-page",
                    )}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                    <span className="mt-2 block text-sm font-medium">{option.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "skill_path" ? (
            <Field label="Add the skill pack to">
              <Select
                value={targetCourseSlug}
                onChange={(event) => setTargetCourseSlug(event.target.value)}
                disabled={courses.length === 0}
              >
                {courses.length ? (
                  courses.map((course) => (
                    <option key={course.slug} value={course.slug}>
                      {course.title}
                    </option>
                  ))
                ) : (
                  <option value="">Create a course first</option>
                )}
              </Select>
            </Field>
          ) : null}

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-page px-4 py-8 text-center transition-colors hover:bg-muted">
            <FileUp className="mb-2 h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-sm font-medium">Add source files</span>
            <span className="mt-0.5 text-xs text-muted-foreground">PDF, Word, spreadsheets, images or text · up to 8</span>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.md,.markdown,.txt,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,text/*"
              className="sr-only"
              onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 8))}
            />
          </label>

          {files.length ? (
            <div className="divide-y divide-border rounded-xl border border-border">
              {files.map((file) => (
                <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{Math.ceil(file.size / 1024)} KB</span>
                </div>
              ))}
            </div>
          ) : null}

          <Field label="Direction" optional>
            <Textarea
              rows={3}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Keep the tone practical, write challenging quizzes, and add one sandbox task if it helps."
            />
          </Field>

          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </Card>
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="primary" disabled={!canSubmit} loading={submitting} icon={Sparkles}>
            {submitting ? "Building your draft" : `Create ${mode === "skill_path" ? "skill pack" : mode} draft`}
          </Button>
        </div>
      </form>
    </div>
  );
}

