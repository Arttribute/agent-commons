"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Radio } from "lucide-react";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input } from "@/components/ui/field";
import { Badge, EmptyState, List, ListRow } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import type { LiveSessionRecord } from "@/types/live-session";

const templates = [
  {
    value: "facilitated_workshop" as const,
    title: "Workshop rhythm",
    body: "Setup, diagnostic, content, practice, retrieval, break and exit reflection.",
  },
  {
    value: "blank" as const,
    title: "Blank room",
    body: "Start empty and add only what you need.",
  },
];

export function LiveSessionManager({
  courseSlug,
  courseTitle,
}: {
  courseSlug: string;
  courseTitle: string;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<LiveSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(`${courseTitle} · live session`);
  const [template, setTemplate] = useState<"facilitated_workshop" | "blank">("facilitated_workshop");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/educator/courses/${courseSlug}/live-sessions`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSessions(data.sessions || []);
    else setNotice(data.error || "Could not load live sessions.");
    setLoading(false);
  }, [courseSlug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createSession(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setNotice("");
    const res = await fetch(`/api/educator/courses/${courseSlug}/live-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, template }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.session) {
      router.push(`/educator/courses/${courseSlug}/live/${data.session.id}`);
      return;
    }
    setNotice(data.error || "Could not create the session.");
    setCreating(false);
  }

  return (
    <div data-copilot-target="live-session-library">
      <CourseSectionHeader
        section="live"
        info="Run a paced room with a learner workbook, setup checks, polls, quizzes and reflections. Works in person or hybrid."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
            New session
          </Button>
        }
      />

      {notice && !createOpen ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p> : null}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-white" />
      ) : sessions.length ? (
        <List>
          {sessions.map((session) => (
            <ListRow
              key={session.id}
              href={`/educator/courses/${courseSlug}/live/${session.id}`}
              leading={
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    session.status === "live" ? "bg-red-50 text-red-600" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Radio className="h-4 w-4" strokeWidth={1.75} />
                </span>
              }
              title={session.title}
              meta={`${session.activities.length} activities · ${session.participantCount} joined`}
              trailing={<SessionStatus status={session.status} />}
            />
          ))}
        </List>
      ) : (
        <EmptyState
          icon={Radio}
          title="No live sessions yet"
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              New session
            </Button>
          }
        />
      )}

      <Drawer
        as="form"
        onSubmit={createSession}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New live session"
        footer={
          <Button type="submit" variant="primary" loading={creating} disabled={!title.trim()}>
            Create session
          </Button>
        }
      >
        <div className="space-y-5">
          <Field label="Title">
            <Input value={title} autoFocus onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">Start from</p>
            <div className="space-y-2">
              {templates.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTemplate(item.value)}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                    template === item.value
                      ? "border-stone-900 bg-white shadow-card"
                      : "border-border bg-white hover:bg-page",
                  )}
                >
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.body}</span>
                </button>
              ))}
            </div>
          </div>
          {notice ? <p className="text-sm text-red-600">{notice}</p> : null}
        </div>
      </Drawer>
    </div>
  );
}

export function SessionStatus({ status }: { status: LiveSessionRecord["status"] }) {
  if (status === "live") return <Badge tone="live" dot>Live</Badge>;
  if (status === "lobby") return <Badge tone="info" dot>Lobby open</Badge>;
  if (status === "ended") return <Badge>Ended</Badge>;
  return <Badge tone="warning">Draft</Badge>;
}
