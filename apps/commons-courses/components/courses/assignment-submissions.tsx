"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Assignment = {
  _id: string;
  title: string;
  instructions: string;
  moduleIndex?: number;
  lessonIndex?: number;
  points: number;
};

type Submission = {
  _id: string;
  assignmentId: string;
  text?: string;
  url?: string;
  status: string;
  score?: number;
  feedback?: string;
};

export function AssignmentSubmissions({
  courseSlug,
  moduleIndex,
  lessonIndex,
  enrolled,
}: {
  courseSlug: string;
  moduleIndex: number;
  lessonIndex: number;
  enrolled: boolean | null;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  useEffect(() => {
    if (!enrolled) return;
    fetch(`/api/courses/${courseSlug}/assignments`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setAssignments(data.assignments || []);
        setSubmissions(data.submissions || []);
      })
      .catch(() => {});
  }, [courseSlug, enrolled]);

  const visibleAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        const moduleMatches =
          assignment.moduleIndex === undefined ||
          assignment.moduleIndex === moduleIndex;
        const lessonMatches =
          assignment.lessonIndex === undefined ||
          assignment.lessonIndex === lessonIndex;
        return moduleMatches && lessonMatches;
      }),
    [assignments, lessonIndex, moduleIndex]
  );

  if (!enrolled || visibleAssignments.length === 0) return null;

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-lg font-bold text-slate-900">Assignments</h2>
      <div className="space-y-4">
        {visibleAssignments.map((assignment) => (
          <AssignmentCard
            key={assignment._id}
            assignment={assignment}
            submission={submissions.find(
              (item) => item.assignmentId === assignment._id
            )}
            onSubmitted={(submission) =>
              setSubmissions((current) => [
                submission,
                ...current.filter((item) => item.assignmentId !== assignment._id),
              ])
            }
          />
        ))}
      </div>
    </section>
  );
}

function AssignmentCard({
  assignment,
  submission,
  onSubmitted,
}: {
  assignment: Assignment;
  submission?: Submission;
  onSubmitted: (submission: Submission) => void;
}) {
  const [text, setText] = useState(submission?.text || "");
  const [url, setUrl] = useState(submission?.url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(`/api/assignments/${assignment._id}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, url }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not submit assignment.");
      return;
    }
    onSubmitted(data.submission);
  }

  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-slate-900">{assignment.title}</h3>
        <span className="text-xs text-slate-500">{assignment.points} pts</span>
      </div>
      <p className="mb-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {assignment.instructions}
      </p>
      {submission && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="font-bold text-slate-700">Status: {submission.status}</p>
          {submission.score !== undefined && (
            <p className="text-slate-600">Score: {submission.score}</p>
          )}
          {submission.feedback && (
            <p className="mt-1 text-slate-600">Feedback: {submission.feedback}</p>
          )}
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your response"
          className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Optional link"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={saving}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? "Submitting..." : submission ? "Update submission" : "Submit"}
        </button>
      </form>
    </div>
  );
}
