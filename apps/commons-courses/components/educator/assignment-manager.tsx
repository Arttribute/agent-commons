"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ClipboardList, ExternalLink, HeartHandshake, Plus, Send } from "lucide-react";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FieldGrid, Input, Select, SwitchRow, Textarea } from "@/components/ui/field";
import { Badge, Card, Disclosure, EmptyState, List, ListRow } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type Person = { _id: string; name?: string; email?: string };

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
  dueAt?: string;
  targetContexts?: Array<{ userId: string; context: string; source?: string }>;
  meetingSlots?: Array<{ id: string; startAt: string; endAt: string; timezone: string }>;
  targetUserIds?: Person[];
};

type Submission = {
  _id: string;
  assignmentId: string;
  text?: string;
  url?: string;
  status: string;
  score?: number;
  feedback?: string;
  submittedAt?: string;
  checkInStatus?: "not_started" | "in_progress" | "blocked" | "completed";
  selectedMeetingSlotId?: string;
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

type ModuleOption = { title: string; lessons: string[] };

function useCourseworkParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: "assignments" | "check-ins" = tabParam === "check-ins" ? "check-ins" : "assignments";
  const assignmentId = searchParams.get("assignment");
  const checkInId = searchParams.get("checkin");
  const go = useCallback(
    (params: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  return { tab, assignmentId, checkInId, go };
}

/**
 * Coursework is split into two lists (assignments and check-ins). Each item
 * opens its own view, and each learner's work opens in a side drawer.
 */
export function AssignmentManager({ slug, modules }: { slug: string; modules: ModuleOption[] }) {
  const { tab, assignmentId, checkInId, go } = useCourseworkParams();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [notifications, setNotifications] = useState<CheckInNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/educator/courses/${slug}/assignments`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setAssignments(data.assignments || []);
    setSubmissions(data.submissions || []);
    setNotifications(data.checkInNotifications || []);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const coursework = assignments.filter((assignment) => assignment.kind !== "follow_up");
  const checkIns = assignments.filter((assignment) => assignment.kind === "follow_up");
  const submissionsFor = (id: string) => submissions.filter((submission) => submission.assignmentId === id);

  const openAssignment = coursework.find((item) => item._id === assignmentId);
  const openCheckIn = checkIns.find((item) => item._id === checkInId);

  async function reviewSubmission(id: string, score: string, feedback: string) {
    await fetch(`/api/educator/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, feedback, status: "reviewed" }),
    });
    await load();
  }

  async function sendCheckIn(assignment: string, userId: string) {
    const response = await fetch(`/api/educator/assignments/${assignment}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not send this check-in.");
    }
    await load();
  }

  if (openAssignment) {
    return (
      <AssignmentDetail
        assignment={openAssignment}
        modules={modules}
        submissions={submissionsFor(openAssignment._id)}
        onBack={() => go({ assignment: null })}
        onReview={reviewSubmission}
      />
    );
  }

  if (openCheckIn) {
    return (
      <CheckInDetail
        checkIn={openCheckIn}
        submissions={submissionsFor(openCheckIn._id)}
        notifications={notifications.filter((item) => item.assignmentId === openCheckIn._id)}
        onBack={() => go({ checkin: null })}
        onSend={sendCheckIn}
      />
    );
  }

  return (
    <div>
      <CourseSectionHeader
        section="coursework"
        actions={
          tab === "assignments" ? (
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              New assignment
            </Button>
          ) : (
            <ButtonLink variant="primary" icon={Plus} href={`/educator/courses/${slug}/engagement?compose=1`}>
              New check-in
            </ButtonLink>
          )
        }
        info={
          tab === "check-ins"
            ? "Check-ins follow up with learners after a live session. Each learner is reminded of what they committed to in the room."
            : undefined
        }
      />

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-white" />
      ) : tab === "assignments" ? (
        coursework.length ? (
          <List>
            {coursework.map((assignment) => {
              const items = submissionsFor(assignment._id);
              const toReview = items.filter((item) => item.status !== "reviewed").length;
              return (
                <ListRow
                  key={assignment._id}
                  onClick={() => go({ assignment: assignment._id })}
                  leading={
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <ClipboardList className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                  }
                  title={assignment.title}
                  meta={[
                    placement(assignment, modules),
                    `${items.length} submission${items.length === 1 ? "" : "s"}`,
                    `${assignment.points} pts`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  trailing={
                    <>
                      {!assignment.published ? <Badge tone="warning">Draft</Badge> : null}
                      {toReview ? <Badge tone="info">{toReview} to review</Badge> : null}
                    </>
                  }
                />
              );
            })}
          </List>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            action={
              <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
                New assignment
              </Button>
            }
          />
        )
      ) : checkIns.length ? (
        <List>
          {checkIns.map((checkIn) => {
            const targets = checkIn.targetUserIds?.length || 0;
            const responded = submissionsFor(checkIn._id).length;
            const sent = notifications.filter((item) => item.assignmentId === checkIn._id && item.sentAt).length;
            return (
              <ListRow
                key={checkIn._id}
                onClick={() => go({ checkin: checkIn._id })}
                leading={
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <HeartHandshake className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                }
                title={checkIn.title}
                meta={`${responded} of ${targets} responded · ${sent} sent`}
                trailing={!checkIn.published ? <Badge tone="warning">Draft</Badge> : null}
              />
            );
          })}
        </List>
      ) : (
        <EmptyState
          icon={HeartHandshake}
          title="No check-ins yet"
          description="Create one from a live session to follow up on what learners committed to."
          action={
            <ButtonLink variant="primary" icon={Plus} href={`/educator/courses/${slug}/engagement?compose=1`}>
              New check-in
            </ButtonLink>
          }
        />
      )}

      <NewAssignmentDrawer
        open={createOpen}
        slug={slug}
        modules={modules}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await load();
        }}
      />
    </div>
  );
}

function NewAssignmentDrawer({
  open,
  slug,
  modules,
  onClose,
  onCreated,
}: {
  open: boolean;
  slug: string;
  modules: ModuleOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const empty = { title: "", instructions: "", moduleIndex: "", lessonIndex: "", points: "100", published: true };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lessons = form.moduleIndex === "" ? [] : modules[Number(form.moduleIndex)]?.lessons || [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(`/api/educator/courses/${slug}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not create the assignment.");
      return;
    }
    setForm(empty);
    onCreated();
  }

  return (
    <Drawer
      as="form"
      onSubmit={submit}
      open={open}
      onClose={onClose}
      title="New assignment"
      footer={
        <Button type="submit" variant="primary" loading={saving}>
          Create assignment
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label="Title">
          <Input required autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <Field label="Instructions">
          <Textarea
            required
            rows={6}
            value={form.instructions}
            onChange={(event) => setForm({ ...form, instructions: event.target.value })}
          />
        </Field>
        <FieldGrid>
          <Field label="Module" optional>
            <Select
              value={form.moduleIndex}
              onChange={(event) => setForm({ ...form, moduleIndex: event.target.value, lessonIndex: "" })}
            >
              <option value="">Whole course</option>
              {modules.map((module, index) => (
                <option key={index} value={String(index)}>
                  {module.title || `Module ${index + 1}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lesson" optional>
            <Select
              value={form.lessonIndex}
              disabled={!lessons.length}
              onChange={(event) => setForm({ ...form, lessonIndex: event.target.value })}
            >
              <option value="">Any lesson</option>
              {lessons.map((lesson, index) => (
                <option key={index} value={String(index)}>
                  {lesson || `Lesson ${index + 1}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Points">
            <Input
              type="number"
              min={0}
              value={form.points}
              onChange={(event) => setForm({ ...form, points: event.target.value })}
            />
          </Field>
        </FieldGrid>
        <div className="border-t border-border">
          <SwitchRow
            label="Publish now"
            info="Published assignments are visible to learners and trigger the new assignment email if it is on."
            checked={form.published}
            onChange={(published) => setForm({ ...form, published })}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Drawer>
  );
}

function AssignmentDetail({
  assignment,
  modules,
  submissions,
  onBack,
  onReview,
}: {
  assignment: Assignment;
  modules: ModuleOption[];
  submissions: Submission[];
  onBack: () => void;
  onReview: (id: string, score: string, feedback: string) => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = submissions.find((item) => item._id === openId);
  return (
    <div>
      <BackLink onClick={onBack} label="Assignments" />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-medium tracking-tight">{assignment.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[placement(assignment, modules), `${assignment.points} pts`].filter(Boolean).join(" · ")}
          </p>
        </div>
        {!assignment.published ? <Badge tone="warning">Draft</Badge> : null}
      </div>
      <Disclosure title="Instructions" summary={assignment.instructions} className="mb-6">
        <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{assignment.instructions}</p>
      </Disclosure>

      <p className="mb-2 text-sm font-medium">
        Submissions <span className="font-normal text-muted-foreground">({submissions.length})</span>
      </p>
      {submissions.length ? (
        <List>
          {submissions.map((submission) => (
            <ListRow
              key={submission._id}
              onClick={() => setOpenId(submission._id)}
              title={personName(submission.userId)}
              meta={submission.submittedAt ? formatDate(submission.submittedAt) : submission.userId?.email}
              trailing={
                <>
                  {submission.score !== undefined && submission.score !== null ? (
                    <span className="text-xs tabular-nums text-muted-foreground">{submission.score} pts</span>
                  ) : null}
                  <Badge tone={submission.status === "reviewed" ? "success" : "info"}>
                    {submission.status === "reviewed" ? "Reviewed" : "To review"}
                  </Badge>
                </>
              }
            />
          ))}
        </List>
      ) : (
        <EmptyState title="No submissions yet" className="py-10" />
      )}

      <SubmissionDrawer
        submission={open}
        title={assignment.title}
        onClose={() => setOpenId(null)}
        onReview={async (score, feedback) => {
          if (!open) return;
          await onReview(open._id, score, feedback);
          setOpenId(null);
        }}
      />
    </div>
  );
}

function SubmissionDrawer({
  submission,
  title,
  onClose,
  onReview,
}: {
  submission?: Submission;
  title: string;
  onClose: () => void;
  onReview: (score: string, feedback: string) => Promise<void>;
}) {
  return (
    <Drawer
      open={Boolean(submission)}
      onClose={onClose}
      title={submission ? personName(submission.userId) : ""}
      description={title}
    >
      {submission ? <SubmissionReviewForm key={submission._id} submission={submission} onReview={onReview} /> : null}
    </Drawer>
  );
}

function SubmissionReviewForm({
  submission,
  onReview,
}: {
  submission: Submission;
  onReview: (score: string, feedback: string) => Promise<void>;
}) {
  const [score, setScore] = useState(submission.score !== undefined && submission.score !== null ? String(submission.score) : "");
  const [feedback, setFeedback] = useState(submission.feedback || "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-5">
      <div>
        {submission.text ? (
          <p className="whitespace-pre-wrap rounded-lg bg-page px-4 py-3 text-sm leading-6">{submission.text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No written response.</p>
        )}
        {submission.url ? (
          <a
            href={submission.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.75} /> Open submitted link
          </a>
        ) : null}
      </div>
      <div className="space-y-4 border-t border-border pt-5">
        <Field label="Score">
          <Input type="number" min={0} value={score} onChange={(event) => setScore(event.target.value)} className="w-32" />
        </Field>
        <Field label="Feedback">
          <Textarea rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
        </Field>
        <Button
          variant="primary"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            await onReview(score, feedback);
            setSaving(false);
          }}
        >
          {submission.status === "reviewed" ? "Update review" : "Mark reviewed"}
        </Button>
      </div>
    </div>
  );
}

const steps = ["Sent", "Opened", "Responding", "Submitted"] as const;

function CheckInDetail({
  checkIn,
  submissions,
  notifications,
  onBack,
  onSend,
}: {
  checkIn: Assignment;
  submissions: Submission[];
  notifications: CheckInNotification[];
  onBack: () => void;
  onSend: (assignmentId: string, userId: string) => Promise<void>;
}) {
  const [openLearner, setOpenLearner] = useState<string | null>(null);
  const learners = useMemo(() => checkIn.targetUserIds || [], [checkIn.targetUserIds]);
  const rows = useMemo(
    () =>
      learners.map((learner) => {
        const notification = notifications.find((item) => personId(item.userId) === learner._id);
        const submission = submissions.find((item) => personId(item.userId) === learner._id);
        const reached = [
          Boolean(notification?.sentAt),
          Boolean(notification?.openedAt),
          Boolean(notification?.startedAt),
          Boolean(submission),
        ];
        return { learner, notification, submission, reached };
      }),
    [learners, notifications, submissions],
  );
  const open = rows.find((row) => row.learner._id === openLearner);

  return (
    <div>
      <BackLink onClick={onBack} label="Check-ins" />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-medium tracking-tight">{checkIn.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {submissions.length} of {learners.length} responded
          </p>
        </div>
        {!checkIn.published ? <Badge tone="warning">Draft</Badge> : null}
      </div>
      <Disclosure title="Prompt" summary={checkIn.instructions} className="mb-6">
        <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{checkIn.instructions}</p>
        {checkIn.context ? (
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-page px-3 py-2 text-sm leading-6 text-stone-600">
            {checkIn.context}
          </p>
        ) : null}
      </Disclosure>

      <List>
        {rows.map(({ learner, notification, reached }) => (
          <ListRow
            key={learner._id}
            onClick={() => setOpenLearner(learner._id)}
            title={personName(learner)}
            meta={learner.email}
            trailing={
              <>
                {notification?.emailStatus === "failed" ? <Badge tone="danger">Email failed</Badge> : null}
                <ProgressDots reached={reached} />
              </>
            }
          />
        ))}
      </List>

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenLearner(null)}
        title={open ? personName(open.learner) : ""}
        description={open?.learner.email}
      >
        {open ? (
          <CheckInLearner
            checkIn={checkIn}
            learner={open.learner}
            notification={open.notification}
            submission={open.submission}
            onSend={() => onSend(checkIn._id, open.learner._id)}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function CheckInLearner({
  checkIn,
  learner,
  notification,
  submission,
  onSend,
}: {
  checkIn: Assignment;
  learner: Person;
  notification?: CheckInNotification;
  submission?: Submission;
  onSend: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const context = checkIn.targetContexts?.find((item) => String(item.userId) === String(learner._id));
  const slot = checkIn.meetingSlots?.find((item) => item.id === submission?.selectedMeetingSlotId);
  const dates = [notification?.sentAt, notification?.openedAt, notification?.startedAt, notification?.submittedAt];
  const reached = [Boolean(notification?.sentAt), Boolean(notification?.openedAt), Boolean(notification?.startedAt), Boolean(submission)];

  return (
    <div className="space-y-6">
      <ol className="space-y-2">
        {steps.map((label, index) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                reached[index] ? "bg-emerald-500" : "bg-stone-200",
              )}
            />
            <span className={cn("flex-1", !reached[index] && "text-muted-foreground")}>{label}</span>
            <span className="text-xs text-muted-foreground">{dates[index] ? formatDate(dates[index]!) : "Not yet"}</span>
          </li>
        ))}
      </ol>
      {notification?.emailStatus === "failed" ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Email failed{notification.lastError ? `: ${notification.lastError}` : "."}
        </p>
      ) : null}

      {submission ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Response</p>
            {submission.checkInStatus ? (
              <Badge>{submission.checkInStatus.replace("_", " ")}</Badge>
            ) : null}
          </div>
          {slot ? <p className="mb-2 text-sm">One-on-one: {formatMeetingSlot(slot)}</p> : null}
          {submission.text ? (
            <p className="whitespace-pre-wrap rounded-lg bg-page px-4 py-3 text-sm leading-6">{submission.text}</p>
          ) : null}
          {submission.url ? (
            <a
              href={submission.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.75} /> Open evidence
            </a>
          ) : null}
        </div>
      ) : null}

      {context?.context ? (
        <Card className="bg-page shadow-none">
          <p className="mb-1 text-xs font-medium text-muted-foreground">What this learner will recall</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{context.context}</p>
        </Card>
      ) : null}

      <div className="border-t border-border pt-5">
        <Button
          icon={Send}
          loading={sending}
          onClick={async () => {
            setSending(true);
            setError("");
            try {
              await onSend();
            } catch (sendError) {
              setError(sendError instanceof Error ? sendError.message : "Could not send this check-in.");
            } finally {
              setSending(false);
            }
          }}
        >
          {notification?.sentAt ? "Resend check-in" : "Send check-in"}
        </Button>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}

function ProgressDots({ reached }: { reached: boolean[] }) {
  const lastReached = reached.lastIndexOf(true);
  return (
    <span className="flex items-center gap-2" title={lastReached >= 0 ? steps[lastReached] : "Not sent"}>
      <span className="flex items-center gap-1">
        {reached.map((done, index) => (
          <span key={index} className={cn("h-1.5 w-4 rounded-full", done ? "bg-emerald-500" : "bg-stone-200")} />
        ))}
      </span>
      <span className="hidden w-20 text-xs text-muted-foreground sm:inline">
        {lastReached >= 0 ? steps[lastReached] : "Not sent"}
      </span>
    </span>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );
}

function placement(assignment: Assignment, modules: ModuleOption[]) {
  if (assignment.moduleIndex === undefined || assignment.moduleIndex === null) return "";
  const target = modules[assignment.moduleIndex];
  const lesson =
    assignment.lessonIndex !== undefined && assignment.lessonIndex !== null
      ? target?.lessons[assignment.lessonIndex]
      : undefined;
  return [target?.title || `Module ${assignment.moduleIndex + 1}`, lesson].filter(Boolean).join(" › ");
}

function personId(person?: Person) {
  return person?._id ? String(person._id) : "";
}

function personName(person?: Person) {
  return person?.name || person?.email || "Learner";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

function formatMeetingSlot(slot: { startAt: string; endAt: string; timezone: string }) {
  const date = new Date(slot.startAt);
  const end = new Date(slot.endAt);
  const day = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: slot.timezone,
  }).format(date);
  const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: slot.timezone }).format(date);
  const endTime = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: slot.timezone }).format(end);
  return `${day} · ${time}–${endTime}`;
}

