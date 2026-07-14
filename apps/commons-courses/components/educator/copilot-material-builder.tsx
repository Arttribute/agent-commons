"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileUp, Loader2, Sparkles } from "lucide-react";

type ManagedCourse = {
  title: string;
  slug: string;
};

type CopilotResult = {
  mode: "course" | "skill_path";
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

export function CopilotMaterialBuilder({
  courses,
}: {
  courses: ManagedCourse[];
}) {
  const [mode, setMode] = useState<"course" | "skill_path">("course");
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
      (mode === "course" || Boolean(targetCourseSlug)),
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
      <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <p className="text-sm font-black text-slate-950">Material upload</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Upload source material and let the copilot create a reviewable draft course or skill path in your account.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-lg border border-slate-200 p-3">
            <span className="text-sm font-bold text-slate-700">Create</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as "course" | "skill_path")}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            >
              <option value="course">New draft course</option>
              <option value="skill_path">Skill path for existing course</option>
            </select>
          </label>

          <label className="rounded-lg border border-slate-200 p-3">
            <span className="text-sm font-bold text-slate-700">Target course</span>
            <select
              value={targetCourseSlug}
              onChange={(event) => setTargetCourseSlug(event.target.value)}
              disabled={mode === "course" || courses.length === 0}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400 focus:border-slate-400"
            >
              {courses.length ? (
                courses.map((course) => (
                  <option key={course.slug} value={course.slug}>
                    {course.title}
                  </option>
                ))
              ) : (
                <option value="">No courses yet</option>
              )}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-slate-700">Copilot instructions</span>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Example: keep the tone practical, create challenging quizzes, and add one sandbox task if the material supports it."
            className="mt-2 min-h-32 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400"
          />
        </label>

        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:bg-slate-100">
          <FileUp className="mb-3 h-6 w-6 text-slate-400" />
          <span className="text-sm font-bold text-slate-800">
            Upload course materials
          </span>
          <span className="mt-1 text-xs leading-5 text-slate-500">
            PDF, images, Markdown, text, CSV, or JSON. Up to 8 files.
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.markdown,.txt,.csv,.json,application/pdf,image/png,image/jpeg,image/webp,text/*"
            className="sr-only"
            onChange={(event) =>
              setFiles(Array.from(event.target.files || []).slice(0, 8))
            }
          />
        </label>

        {files.length ? (
          <div className="rounded-lg border border-slate-200 bg-white">
            {files.map((file) => (
              <div
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
              >
                <span className="truncate font-semibold text-slate-700">
                  {file.name}
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
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Create draft
        </button>
      </form>

      <aside className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-black text-slate-950">Copilot standard</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            The draft should follow the uploaded material, use consistent terminology,
            avoid unsupported topics, include meaningful quizzes, and add a focused sandbox when the material supports practice.
          </p>
        </div>

        {result ? (
          <div className="rounded-lg border border-lime-200 bg-lime-50 p-4">
            <p className="text-sm font-black text-lime-950">
              Draft created
            </p>
            <p className="mt-2 text-sm leading-6 text-lime-800">
              {result.mode === "course"
                ? `Created ${result.course.title}.`
                : `Added ${result.skillPath?.title || "the skill path"} to ${result.course.title}.`}
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
