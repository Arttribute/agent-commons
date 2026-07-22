"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  FileUp,
  Layers3,
  Loader2,
  Sparkles,
} from "lucide-react";

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={submit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <p className="text-sm font-medium text-slate-950">Build a learning resource</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Choose the learning format, give your copilot direction, and add the source files.
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Learning format
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {MATERIAL_MODES.map((option) => {
              const Icon = option.icon;
              const selected = mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-lime-400 bg-lime-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <Icon className="h-4 w-4 text-slate-700" />
                    {selected ? (
                      <span className="rounded-full bg-slate-950 p-0.5 text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-3 block text-sm font-medium text-slate-950">
                    {option.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {mode === "skill_path" ? (
          <label className="block rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Add the skill pack to
            </span>
            <select
              value={targetCourseSlug}
              onChange={(event) => setTargetCourseSlug(event.target.value)}
              disabled={courses.length === 0}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950 disabled:text-slate-400"
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
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Teaching direction</span>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Example: keep the tone practical, create challenging quizzes, and add one sandbox task if the material supports it."
            className="mt-2 min-h-32 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-950"
          />
        </label>

        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-lime-500 hover:bg-lime-50/50">
          <span className="mb-3 rounded-full bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <FileUp className="h-5 w-5 text-slate-700" />
          </span>
          <span className="text-sm font-medium text-slate-900">
            Add your source materials
          </span>
          <span className="mt-1 text-xs leading-5 text-slate-500">
            PDF, Word, spreadsheets, images, Markdown, text, CSV, or JSON · up to 8 files
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.md,.markdown,.txt,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,text/*"
            className="sr-only"
            onChange={(event) =>
              setFiles(Array.from(event.target.files || []).slice(0, 8))
            }
          />
        </label>

        {files.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {files.map((file) => (
              <div
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
              >
                <span className="flex min-w-0 items-center gap-2 text-slate-700">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate font-medium">{file.name}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {Math.ceil(file.size / 1024)} KB
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {submitting
            ? "Building your draft…"
            : `Create ${mode === "skill_path" ? "skill pack" : mode} draft`}
        </button>
      </form>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-950">How your copilot builds</p>
          <ol className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
            <BuildStep number="1" text="Separates source text, structure, tables, and original PDF visuals." />
            <BuildStep number="2" text="Matches each visual to the section it actually illustrates." />
            <BuildStep number="3" text="Creates activities and checks that support the learning goals." />
            <BuildStep number="4" text="Saves a private draft for educator review—not automatic publishing." />
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-950">CommonLab learning standard</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Drafts stay grounded in your sources, preserve consistent terminology,
            include meaningful practice, and use focused sandboxes only when hands-on work helps.
          </p>
        </div>

        {result ? (
          <div className="rounded-2xl border border-lime-200 bg-lime-50 p-4 shadow-sm">
            <p className="text-sm font-medium text-lime-950">
              Draft created
            </p>
            <p className="mt-2 text-sm leading-6 text-lime-800">
              {result.mode === "skill_path"
                ? `Added ${result.skillPath?.title || "the skill path"} to ${result.course.title}.`
                : `Created ${result.course.title}${result.mode === "workbook" ? " as an interactive workbook" : ""}.`}
            </p>
            <div className="mt-3 space-y-2">
              <ResultLink href={result.course.href} label="Open course draft" />
              {result.mode === "skill_path" && result.skillPath ? (
                <ResultLink href={result.skillPath.href} label="Open skill path" />
              ) : null}
            </div>
            {result.notes?.length ? (
              <div className="mt-3 space-y-1 text-xs leading-5 text-lime-900">
                {result.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function BuildStep({ number, text }: { number: string; text: string }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-200 text-[10px] font-bold text-slate-950">
        {number}
      </span>
      <span>{text}</span>
    </li>
  );
}

function ResultLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-lime-200 bg-white px-3 py-2 text-sm font-bold text-lime-950"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
