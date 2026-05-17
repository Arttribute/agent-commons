"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ScrollableListFrame } from "@/components/educator/scrollable-list-frame";

type Assignment = {
  _id: string;
  title: string;
  instructions: string;
  moduleIndex?: number;
  lessonIndex?: number;
  points: number;
  published: boolean;
};

type Submission = {
  _id: string;
  assignmentId: string;
  text?: string;
  url?: string;
  status: string;
  score?: number;
  feedback?: string;
  userId?: { name?: string; email?: string };
};

export function AssignmentManager({ slug }: { slug: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [form, setForm] = useState({
    title: "",
    instructions: "",
    moduleIndex: "",
    lessonIndex: "",
    points: "100",
    published: true,
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/educator/courses/${slug}/assignments`);
    const data = await res.json();
    setAssignments(data.assignments || []);
    setSubmissions(data.submissions || []);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/educator/courses/${slug}/assignments`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setAssignments(data.assignments || []);
        setSubmissions(data.submissions || []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    const res = await fetch(`/api/educator/courses/${slug}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({
        title: "",
        instructions: "",
        moduleIndex: "",
        lessonIndex: "",
        points: "100",
        published: true,
      });
      load();
    }
  }

  async function reviewSubmission(id: string, score: string, feedback: string) {
    await fetch(`/api/educator/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, feedback, status: "reviewed" }),
    });
    load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form onSubmit={createAssignment} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">New assignment</h2>
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <textarea
          required
          placeholder="Instructions"
          value={form.instructions}
          onChange={(event) => setForm({ ...form, instructions: event.target.value })}
          className="min-h-32 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Module index"
            value={form.moduleIndex}
            onChange={(event) => setForm({ ...form, moduleIndex: event.target.value })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            placeholder="Lesson index"
            value={form.lessonIndex}
            onChange={(event) => setForm({ ...form, lessonIndex: event.target.value })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <input
          placeholder="Points"
          value={form.points}
          onChange={(event) => setForm({ ...form, points: event.target.value })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">
          Create assignment
        </button>
      </form>

      <div className="space-y-8">
        <ScrollableListFrame title="Assignments" count={assignments.length} rowHeight={116}>
          <div className="space-y-3 p-3">
            {assignments.map((assignment) => (
              <div key={assignment._id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-slate-900">{assignment.title}</h3>
                  <span className="text-xs text-slate-500">{assignment.points} pts</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{assignment.instructions}</p>
              </div>
            ))}
            {assignments.length === 0 && <p className="text-sm text-slate-500">No assignments yet.</p>}
          </div>
        </ScrollableListFrame>

        <ScrollableListFrame title="Submissions" count={submissions.length} rowHeight={172}>
          <div className="space-y-3 p-3">
            {submissions.map((submission) => (
              <SubmissionReview
                key={submission._id}
                submission={submission}
                assignments={assignments}
                onReview={reviewSubmission}
              />
            ))}
            {submissions.length === 0 && <p className="text-sm text-slate-500">No submissions yet.</p>}
          </div>
        </ScrollableListFrame>
      </div>
    </div>
  );
}

function SubmissionReview({
  submission,
  assignments,
  onReview,
}: {
  submission: Submission;
  assignments: Assignment[];
  onReview: (id: string, score: string, feedback: string) => void;
}) {
  const [score, setScore] = useState(String(submission.score || ""));
  const [feedback, setFeedback] = useState(submission.feedback || "");
  const assignment = assignments.find((item) => item._id === submission.assignmentId);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-slate-900">{assignment?.title || "Assignment"}</p>
          <p className="text-xs text-slate-500">
            {submission.userId?.name || submission.userId?.email} · {submission.status}
          </p>
        </div>
      </div>
      {submission.text && <p className="mb-2 whitespace-pre-wrap text-sm text-slate-700">{submission.text}</p>}
      {submission.url && (
        <a href={submission.url} target="_blank" className="text-sm font-bold text-slate-900 underline">
          Open submitted link
        </a>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-[100px_1fr_auto]">
        <input value={score} onChange={(event) => setScore(event.target.value)} placeholder="Score" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <input value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Feedback" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <button onClick={() => onReview(submission._id, score, feedback)} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">
          Review
        </button>
      </div>
    </div>
  );
}
