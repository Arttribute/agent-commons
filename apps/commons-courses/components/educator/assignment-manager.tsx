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
  kind?: "coursework" | "follow_up";
  context?: string;
  targetContexts?: Array<{
    userId: string;
    context: string;
    source?: string;
  }>;
  targetUserIds?: Person[];
};

type Person = { _id: string; name?: string; email?: string };

type Submission = {
  _id: string;
  assignmentId: string;
  text?: string;
  url?: string;
  status: string;
  score?: number;
  feedback?: string;
  checkInStatus?: "not_started" | "in_progress" | "blocked" | "completed";
  userId?: Person;
};

type CheckInNotification = {
  _id: string;
  assignmentId: string;
  userId?: Person;
  email?: string;
  emailStatus: "not_sent" | "pending" | "sent" | "skipped" | "failed";
  lastError?: string;
  sentAt?: string;
  openedAt?: string;
  startedAt?: string;
  submittedAt?: string;
};

export function AssignmentManager({ slug }: { slug: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [checkInNotifications, setCheckInNotifications] = useState<CheckInNotification[]>([]);
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
    setCheckInNotifications(data.checkInNotifications || []);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/educator/courses/${slug}/assignments`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setAssignments(data.assignments || []);
        setSubmissions(data.submissions || []);
        setCheckInNotifications(data.checkInNotifications || []);
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

  async function sendCheckIn(assignmentId: string, userId: string) {
    const response = await fetch(
      `/api/educator/assignments/${assignmentId}/notifications`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [userId] }),
      },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not send this check-in.");
    }
    await load();
  }

  const followUps = assignments.filter((assignment) => assignment.kind === "follow_up");

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
                  <div>
                    {assignment.kind === "follow_up" && <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Continuity check-in</p>}
                    <h3 className="font-bold text-slate-900">{assignment.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {!assignment.published && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Draft</span>}
                    <span className="text-xs text-slate-500">{assignment.points} pts</span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">{assignment.instructions}</p>
              </div>
            ))}
            {assignments.length === 0 && <p className="text-sm text-slate-500">No assignments yet.</p>}
          </div>
        </ScrollableListFrame>

        {followUps.length > 0 && (
          <CheckInProgress
            assignments={followUps}
            notifications={checkInNotifications}
            submissions={submissions}
            onSend={sendCheckIn}
          />
        )}

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

function CheckInProgress({
  assignments,
  notifications,
  submissions,
  onSend,
}: {
  assignments: Assignment[];
  notifications: CheckInNotification[];
  submissions: Submission[];
  onSend: (assignmentId: string, userId: string) => Promise<void>;
}) {
  const [sendingKey, setSendingKey] = useState("");
  const [error, setError] = useState("");
  const count = assignments.reduce(
    (total, assignment) => total + (assignment.targetUserIds?.length || 0),
    0,
  );

  async function send(assignmentId: string, userId: string) {
    const key = `${assignmentId}:${userId}`;
    setSendingKey(key);
    setError("");
    try {
      await onSend(assignmentId, userId);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send this check-in.",
      );
    } finally {
      setSendingKey("");
    }
  }

  return (
    <ScrollableListFrame title="Check-in progress" count={count} rowHeight={250}>
      <div className="space-y-4 p-3">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {assignments.map((assignment) => (
          <section key={assignment._id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="border-b border-slate-100 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Continuity check-in</p>
              <h3 className="mt-1 font-bold text-slate-950">{assignment.title}</h3>
              {assignment.context && (
                <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap pr-2 text-sm leading-6 text-slate-600">
                  {assignment.context}
                </p>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {(assignment.targetUserIds || []).map((learner) => {
                const notification = notifications.find(
                  (item) =>
                    item.assignmentId === assignment._id &&
                    personId(item.userId) === learner._id,
                );
                const submission = submissions.find(
                  (item) =>
                    item.assignmentId === assignment._id &&
                    personId(item.userId) === learner._id,
                );
                const key = `${assignment._id}:${learner._id}`;
                const personalizedContext = assignment.targetContexts?.find(
                  (item) => String(item.userId) === String(learner._id),
                );
                return (
                  <div key={learner._id} className="py-4 first:pt-4 last:pb-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{learner.name || learner.email || "Learner"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{learner.email}</p>
                      </div>
                      <button
                        type="button"
                        disabled={sendingKey === key}
                        onClick={() => send(assignment._id, learner._id)}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:border-slate-400 disabled:opacity-50"
                      >
                        {sendingKey === key ? "Sending…" : notification?.sentAt ? "Resend check-in" : "Send check-in"}
                      </button>
                    </div>
                    {personalizedContext?.context && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">What this learner will recall</p>
                        <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap pr-2 text-sm leading-6 text-slate-700">{personalizedContext.context}</p>
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <ProgressStep label="Sent" active={Boolean(notification?.sentAt)} date={notification?.sentAt} />
                      <ProgressStep label="Opened" active={Boolean(notification?.openedAt)} date={notification?.openedAt} />
                      <ProgressStep label="Responding" active={Boolean(notification?.startedAt)} date={notification?.startedAt} />
                      <ProgressStep label="Submitted" active={Boolean(submission)} date={notification?.submittedAt} />
                    </div>
                    {notification?.emailStatus === "failed" && (
                      <p className="mt-3 text-xs font-semibold text-red-600">Email failed{notification.lastError ? `: ${notification.lastError}` : "."}</p>
                    )}
                    {submission && (
                      <div className="mt-4 rounded-lg bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Final response</p>
                          {submission.checkInStatus && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold capitalize text-slate-600">{submission.checkInStatus.replace("_", " ")}</span>}
                        </div>
                        {submission.text && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{submission.text}</p>}
                        {submission.url && <a href={submission.url} target="_blank" className="mt-2 inline-block text-sm font-bold text-slate-900 underline">Open evidence</a>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ScrollableListFrame>
  );
}

function ProgressStep({
  label,
  active,
  date,
}: {
  label: string;
  active: boolean;
  date?: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`} />
        <span className={`text-xs font-bold ${active ? "text-emerald-800" : "text-slate-500"}`}>{label}</span>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">{date ? formatDate(date) : "Not yet"}</p>
    </div>
  );
}

function personId(person?: Person) {
  return person?._id ? String(person._id) : "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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
      {submission.checkInStatus && (
        <span className="mb-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-600">
          {submission.checkInStatus.replace("_", " ")}
        </span>
      )}
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
