"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { BarChart3, HeartHandshake, Search } from "lucide-react";
import type {
  EngagementActivity,
  EngagementLearner,
  EngagementSummary,
} from "@/types/course-engagement";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select, SwitchRow, Textarea } from "@/components/ui/field";
import { EmptyState, IndexChip, List, ListRow, StatStrip } from "@/components/ui/surface";
import { Tabs } from "@/components/ui/tabs";

type SessionOption = {
  id: string;
  title: string;
  status: string;
  date: string;
  participantCount: number;
  responseCount: number;
};

type FollowUp = {
  id: string;
  title: string;
  published: boolean;
  dueAt?: string;
  targetCount: number;
  submissionCount: number;
  reviewedCount: number;
};

export function CourseEngagementWorkspace({
  slug,
  sessions,
  selectedSessionId,
  summary,
  activities,
  learners,
}: {
  slug: string;
  sessions: SessionOption[];
  selectedSessionId?: string;
  summary?: EngagementSummary;
  activities: EngagementActivity[];
  learners: EngagementLearner[];
  followUps: FollowUp[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"activities" | "learners">("activities");
  const [query, setQuery] = useState("");
  const [openActivity, setOpenActivity] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(searchParams.get("compose") === "1");

  const visibleLearners = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return learners;
    return learners.filter((learner) => `${learner.name} ${learner.email}`.toLowerCase().includes(normalized));
  }, [learners, query]);
  const activity = activities.find((item) => item.id === openActivity);

  if (!selectedSessionId || !summary) {
    return (
      <>
        <CourseSectionHeader section="live" />
        <EmptyState
          icon={BarChart3}
          title="Insights appear after your first live session"
          description="Attendance, participation and responses are collected automatically."
        />
      </>
    );
  }

  return (
    <div>
      <CourseSectionHeader
        section="live"
        actions={
          <>
            <Select
              aria-label="Live session"
              className="w-auto max-w-64"
              value={selectedSessionId}
              onChange={(event) =>
                router.push(`/educator/courses/${slug}/engagement?session=${event.target.value}`)
              }
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </Select>
            <Button icon={HeartHandshake} onClick={() => setComposerOpen(true)}>
              Check-in
            </Button>
          </>
        }
      />

      <StatStrip
        className="mb-6 lg:grid-cols-5"
        items={[
          { label: "Attended", value: summary.attendees },
          { label: "Participated", value: summary.engagedLearners },
          { label: "Participation", value: `${summary.participationRate}%` },
          { label: "Responses", value: summary.responseCount },
          {
            label: "Quiz accuracy",
            value: summary.quizAccuracy === undefined ? "None" : `${summary.quizAccuracy}%`,
          },
        ]}
      />

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "activities", label: "Activities", count: activities.length },
          { value: "learners", label: "Learners", count: learners.length },
        ]}
      />

      {tab === "activities" ? (
        <List>
          {activities.map((item) => (
            <ListRow
              key={item.id}
              onClick={() => setOpenActivity(item.id)}
              leading={<IndexChip value={item.index} />}
              title={item.title}
              meta={`${item.responseCount} responses${item.correctRate === undefined ? "" : ` · ${item.correctRate}% correct`}`}
              trailing={<RateBar value={item.responseRate} />}
            />
          ))}
        </List>
      ) : (
        <div className="space-y-3">
          <label className="flex max-w-sm items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 shadow-card">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a learner"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <List>
            {visibleLearners.map((learner) => (
              <ListRow
                key={learner.participantId}
                chevron={false}
                title={learner.name}
                meta={`${learner.email} · last active ${formatDate(learner.lastSeenAt)}`}
                trailing={
                  <>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {learner.responseCount} responses
                      {learner.quizTotal ? ` · quiz ${learner.quizCorrect}/${learner.quizTotal}` : ""}
                    </span>
                    <RateBar value={learner.responseRate} />
                  </>
                }
              />
            ))}
            {!visibleLearners.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No learners match.</p>
            ) : null}
          </List>
        </div>
      )}

      <Drawer
        open={Boolean(activity)}
        onClose={() => setOpenActivity(null)}
        width="lg"
        title={activity?.title || ""}
        description={
          activity
            ? `${activity.responseCount} responses · ${activity.responseRate}% of attendees${activity.correctRate === undefined ? "" : ` · ${activity.correctRate}% correct`}`
            : undefined
        }
      >
        {activity ? (
          <div className="space-y-5">
            {activity.options.length ? (
              <div className="space-y-3">
                {activity.options.map((option) => (
                  <div key={option.label}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.count} · {option.percent}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-stone-800" style={{ width: `${option.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="space-y-2">
              {activity.responses.map((response, index) => (
                <div key={`${response.userId}-${index}`} className="rounded-lg border border-border bg-page px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-stone-600">{response.participantName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(response.submittedAt)}</p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{response.value}</p>
                </div>
              ))}
              {!activity.responses.length ? (
                <p className="text-sm text-muted-foreground">No responses for this activity.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Drawer>

      <CheckInComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        slug={slug}
        sessionId={selectedSessionId}
        learners={learners}
        onCreated={() => {
          setComposerOpen(false);
          router.push(`/educator/courses/${slug}/assignments?tab=check-ins`);
        }}
      />
    </div>
  );
}

function CheckInComposer({
  open,
  onClose,
  slug,
  sessionId,
  learners,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  sessionId: string;
  learners: EngagementLearner[];
  onCreated: () => void;
}) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>(learners.map((item) => item.userId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "Your AI Quick Wins outcome check-in",
    context: "",
    instructions:
      "Look back at your outcome contract, then share: the steps you have taken; what changed; how you are measuring progress; your next step and date; and any blocker or support you need.",
    dueAt: "",
    notifyNow: false,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedUsers.length) return;
    setSaving(true);
    setError("");
    const response = await fetch(`/api/educator/courses/${slug}/engagement/check-ins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, sessionId, targetUserIds: selectedUsers }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not create this check-in.");
      return;
    }
    onCreated();
  }

  const allSelected = selectedUsers.length === learners.length;

  return (
    <Drawer
      as="form"
      onSubmit={submit}
      open={open}
      onClose={onClose}
      title="New check-in"
      description="Follow up with learners from this session."
      footer={
        <Button type="submit" variant="primary" loading={saving} disabled={!selectedUsers.length}>
          {form.notifyNow ? "Create and email" : "Save draft"}
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label="Title">
          <Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <Field label="Prompt">
          <Textarea
            required
            rows={5}
            value={form.instructions}
            onChange={(event) => setForm({ ...form, instructions: event.target.value })}
          />
        </Field>
        <Field
          label="Shared focus"
          optional
          info="Leave blank to recall each learner's own outcome, chosen task, commitment or reflection from the session."
        >
          <Textarea
            rows={3}
            value={form.context}
            onChange={(event) => setForm({ ...form, context: event.target.value })}
          />
        </Field>
        <Field label="Due date" optional>
          <Input type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium">
              Learners <span className="font-normal text-muted-foreground">({selectedUsers.length})</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedUsers(allSelected ? [] : learners.map((item) => item.userId))}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {allSelected ? "Clear" : "Select all"}
            </button>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
            {learners.map((learner) => (
              <label
                key={learner.userId}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-stone-900"
                  checked={selectedUsers.includes(learner.userId)}
                  onChange={() =>
                    setSelectedUsers((current) =>
                      current.includes(learner.userId)
                        ? current.filter((id) => id !== learner.userId)
                        : [...current, learner.userId],
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{learner.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{learner.email}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="border-t border-border">
          <SwitchRow
            label="Email learners now"
            info="Leave off to keep a private draft you can send later."
            checked={form.notifyNow}
            onChange={(notifyNow) => setForm({ ...form, notifyNow })}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Drawer>
  );
}

function RateBar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
        <span className="block h-full rounded-full bg-stone-800" style={{ width: `${value}%` }} />
      </span>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value}%</span>
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}
