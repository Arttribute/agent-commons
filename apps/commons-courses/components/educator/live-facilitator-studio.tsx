"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  ChevronRight,
  CircleStop,
  Clipboard,
  Download,
  ExternalLink,
  Layers,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MonitorUp,
  Play,
  Plus,
  Radio,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCourseThemeStyle } from "@/lib/course-theme";
import { labWorkspaceFolderPaths } from "@/lib/lab-workspace-entry";
import type {
  LiveActivity,
  LiveActivityResults,
  LiveActivityType,
  LiveParticipantRecord,
  LiveSessionRecord,
  LiveSessionPart,
  LiveWorksheetField,
} from "@/types/live-session";
import type { CourseMaterialRecord } from "@/types/course-material";
import type { LabWorkspaceRecord } from "@/types/lab-workspace";
import { CourseMaterialViewer } from "@/components/course-material-viewer";
import { LearnerLabWorkspace } from "@/components/labs/learner-lab-workspace";
import { SessionStatus } from "@/components/educator/live-session-manager";
import { Button, IconButton } from "@/components/ui/button";
import { Field, FieldGrid, Input, Select, Switch, SwitchRow, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { Badge, Card, EmptyState, IndexChip, NavItem, SectionTitle } from "@/components/ui/surface";
import { SaveBar } from "@/components/ui/save-bar";
import { Segmented, Tabs, useQueryTab } from "@/components/ui/tabs";
import { InfoTip } from "@/components/ui/tooltip";

type StudioData = {
  session: LiveSessionRecord;
  participants: LiveParticipantRecord[];
  results: Record<string, LiveActivityResults>;
};

const STUDIO_TABS = ["plan", "run", "invite", "settings"] as const;

const activityChoices: Array<{
  type: LiveActivityType;
  label: string;
  hint: string;
}> = [
  { type: "content", label: "Workbook page", hint: "Notes, examples and resources" },
  { type: "setup_check", label: "Setup check", hint: "Catch blockers before teaching" },
  { type: "poll", label: "Poll", hint: "Diagnostic, pulse or opinion" },
  { type: "quiz", label: "Quiz", hint: "Retrieval with a correct answer" },
  { type: "prioritization", label: "Idea shortlist", hint: "Capture ideas, then choose priorities" },
  { type: "worksheet", label: "Fillable worksheet", hint: "Structured fields learners complete" },
  { type: "card_collection", label: "Repeatable cards", hint: "Learners add structured cards" },
  { type: "linked_scorecard", label: "Linked scorecard", hint: "Score cards captured earlier" },
  { type: "reflection", label: "Reflection", hint: "Open response or exit ticket" },
  { type: "task", label: "Practice task", hint: "Instructions and evidence hand-in" },
  { type: "break", label: "Break", hint: "Keep timing visible" },
];

/** Fields that belong to the saved plan (everything the Save button sends). */
function planSnapshot(session: LiveSessionRecord) {
  return JSON.stringify({
    title: session.title,
    description: session.description,
    pace: session.pace,
    access: session.access,
    invitedEmails: session.invitedEmails,
    scheduledStart: session.scheduledStart,
    settings: session.settings,
    activities: session.activities,
    parts: session.parts,
  });
}

export function LiveFacilitatorStudio({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<StudioData | null>(null);
  const [savedPlan, setSavedPlan] = useState("");
  const [tab, setTab] = useQueryTab(STUDIO_TABS, "plan");
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [materials, setMaterials] = useState<CourseMaterialRecord[]>([]);
  const [labWorkspaces, setLabWorkspaces] = useState<LabWorkspaceRecord[]>([]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setNotice(null);
      const res = await fetch(`/api/educator/live-sessions/${sessionId}`, { cache: "no-store" });
      const next = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!quiet) setNotice({ tone: "error", text: next.error || "Could not load this session." });
        return;
      }
      setData(next);
      setSavedPlan(planSnapshot(next.session));
      setSelectedId((current) => current || next.session.activities[0]?.id || "");
    },
    [sessionId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const slug = data?.session.courseSlug;
    if (!slug) return;
    void fetch(`/api/educator/courses/${slug}/materials`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setMaterials(body?.materials || []));
    void fetch(`/api/educator/courses/${slug}/lab-workspaces`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setLabWorkspaces(body?.workspaces || []));
  }, [data?.session.courseSlug]);

  // Refresh participation while the room is open, except while editing.
  useEffect(() => {
    if (tab === "plan" || tab === "settings") return;
    if (data?.session.status !== "live" && data?.session.status !== "lobby") return;
    const interval = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(interval);
  }, [data?.session.status, load, tab]);

  const dirty = useMemo(
    () => (data ? planSnapshot(data.session) !== savedPlan : false),
    [data, savedPlan],
  );

  const selected = data?.session.activities.find((activity) => activity.id === selectedId);
  const current = data?.session.activities.find(
    (activity) => activity.id === data.session.currentActivityId,
  );
  const currentPart = data?.session.parts.find(
    (part) => part.id === data.session.currentPartId || part.activityIds.includes(current?.id || ""),
  );
  const currentPartActivities = currentPart
    ? currentPart.activityIds.flatMap((activityId) => {
        const activity = data?.session.activities.find((candidate) => candidate.id === activityId);
        return activity ? [activity] : [];
      })
    : data?.session.activities || [];
  const currentPartIndex = currentPartActivities.findIndex((activity) => activity.id === current?.id);
  const nextActivity = currentPartActivities[currentPartIndex + 1];

  function updateSession(patch: Partial<LiveSessionRecord>) {
    setData((currentData) =>
      currentData ? { ...currentData, session: { ...currentData.session, ...patch } } : currentData,
    );
  }

  function updateSettings(patch: Partial<LiveSessionRecord["settings"]>) {
    if (!data) return;
    updateSession({ settings: { ...data.session.settings, ...patch } });
  }

  function updateActivity(activityId: string, patch: Partial<LiveActivity>) {
    if (!data) return;
    updateSession({
      activities: data.session.activities.map((activity) =>
        activity.id === activityId ? { ...activity, ...patch } : activity,
      ),
    });
  }

  async function savePlan() {
    if (!data || saving) return;
    setSaving(true);
    setNotice(null);
    const res = await fetch(`/api/educator/live-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.session.title,
        description: data.session.description,
        pace: data.session.pace,
        access: data.session.access,
        invitedEmails: data.session.invitedEmails,
        scheduledStart: data.session.scheduledStart,
        settings: data.session.settings,
        activities: data.session.activities,
        parts: data.session.parts,
      }),
    });
    const next = await res.json().catch(() => ({}));
    if (res.ok) {
      setData((value) => (value ? { ...value, session: next.session } : value));
      setSavedPlan(planSnapshot(next.session));
    } else setNotice({ tone: "error", text: next.error || "Could not save the session plan." });
    setSaving(false);
  }

  async function command(
    commandName: string,
    activityId?: string,
    partId?: string,
    pace?: LiveSessionPart["pace"],
  ) {
    if (running) return;
    setRunning(true);
    setNotice(null);
    const res = await fetch(`/api/educator/live-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: commandName, activityId, partId, pace }),
    });
    const next = await res.json().catch(() => ({}));
    if (res.ok) {
      setData((currentData) => (currentData ? { ...currentData, session: next.session } : currentData));
      setSavedPlan(planSnapshot(next.session));
      const active = next.session?.activities?.find(
        (item: LiveActivity) => item.id === next.session.currentActivityId,
      );
      const message =
        commandName === "activate" || commandName === "start"
          ? `Learners now see ${active?.title || "the active activity"}.`
          : commandName === "close_activity"
            ? "Responses closed. Learners still see this activity while you debrief."
            : commandName === "open_lobby"
              ? "Lobby open. Learners can join; activities stay hidden until you begin."
              : commandName === "end"
                ? "Session ended. Learner responses are saved."
                : null;
      if (message) setNotice({ tone: "info", text: message });
      void load(true);
      if (commandName === "open_lobby") setTab("invite");
      if (commandName === "start" || commandName === "activate") setTab("run");
    } else setNotice({ tone: "error", text: next.error || "Could not update the live room." });
    setRunning(false);
  }

  function addActivity(type: LiveActivityType) {
    if (!data) return;
    const id = crypto.randomUUID();
    const label = activityChoices.find((choice) => choice.type === type)?.label || "Activity";
    const activity: LiveActivity = {
      id,
      type,
      title: `New ${label.toLowerCase()}`,
      status: "draft",
      required: false,
      randomizeOptions: type === "quiz",
      showResults: type === "poll" || type === "quiz" || type === "setup_check",
      entryLabel: type === "prioritization" ? "Add an idea" : undefined,
      selectionPrompt: type === "prioritization" ? "Choose the ideas you want to take forward." : undefined,
      minItems: type === "prioritization" ? 3 : undefined,
      maxSelections: type === "prioritization" ? 3 : undefined,
      worksheetFields:
        type === "worksheet" || type === "card_collection"
          ? [
              {
                id: "card-title",
                label: type === "card_collection" ? "Card title" : "Workbook question",
                type: "long_text",
                required: true,
              },
            ]
          : [],
      itemTitleFieldId: type === "card_collection" ? "card-title" : undefined,
      sourceActivityId:
        type === "linked_scorecard"
          ? data.session.activities.find((item) => item.type === "card_collection")?.id
          : undefined,
      scoreCriteria:
        type === "linked_scorecard"
          ? [{ id: "impact", label: "Impact", min: 1, max: 5, lowLabel: "Low", highLabel: "High" }]
          : [],
      points: type === "quiz" ? 1 : 0,
      options: ["poll", "quiz", "setup_check"].includes(type)
        ? [
            { id: crypto.randomUUID(), label: "Option 1", isCorrect: type === "quiz" },
            { id: crypto.randomUUID(), label: "Option 2", isCorrect: false },
          ]
        : [],
    };
    updateSession({ activities: [...data.session.activities, activity] });
    setSelectedId(id);
  }

  function moveActivity(id: string, direction: -1 | 1) {
    if (!data) return;
    const activities = [...data.session.activities];
    const index = activities.findIndex((activity) => activity.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= activities.length) return;
    [activities[index], activities[nextIndex]] = [activities[nextIndex], activities[index]];
    updateSession({ activities });
  }

  function removeActivity(id: string) {
    if (!data) return;
    if (!window.confirm("Remove this activity?")) return;
    const activities = data.session.activities.filter((activity) => activity.id !== id);
    updateSession({ activities });
    setSelectedId(activities[0]?.id || "");
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-white text-sm text-muted-foreground">
        {notice?.text || (
          <>
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading live session
          </>
        )}
      </div>
    );
  }

  const session = data.session;
  const joinPath = `/live/${session.id}`;
  const joinUrl = typeof window === "undefined" ? joinPath : `${window.location.origin}${joinPath}`;
  const joinPortal = typeof window === "undefined" ? "/join" : `${window.location.origin}/join`;
  const qrPath = `/api/educator/live-sessions/${session.id}/qr`;

  return (
    <div
      style={getCourseThemeStyle(session.courseTheme) as CSSProperties}
      data-copilot-target="live-facilitation-studio"
    >
      <Link
        href={`/educator/courses/${session.courseSlug}/live`}
        className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Live sessions
      </Link>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-lg font-medium tracking-tight">{session.title}</h1>
            <SessionStatus status={session.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Code {formatCode(session.joinCode)} · {session.participantCount} joined ·{" "}
            {session.activities.length} activities
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session.parts.length ? (
            <ProgrammeMenu
              parts={session.parts}
              running={running}
              onOpen={(partId) => command("open_part", undefined, partId)}
              onClose={(partId) => command("close_part", undefined, partId)}
              onPaceChange={(partId, pace) => command("set_part_pace", undefined, partId, pace)}
            />
          ) : null}
          {session.status === "draft" ? (
            <Button icon={MonitorUp} onClick={() => command("open_lobby")} disabled={running}>
              Open for joining
            </Button>
          ) : null}
          {session.status === "lobby" || (session.status === "live" && !current) ? (
            <Button
              variant="primary"
              icon={Play}
              onClick={() => command("start")}
              disabled={running || !session.activities.length}
            >
              {session.status === "live" ? "Restore activity" : "Start"}
            </Button>
          ) : null}
          {session.status === "live" ? (
            <Button variant="danger" icon={CircleStop} onClick={() => command("end")} disabled={running}>
              End
            </Button>
          ) : null}
        </div>
      </header>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "plan", label: "Plan" },
          { value: "run", label: "Run" },
          { value: "invite", label: "Invite" },
          { value: "settings", label: "Settings" },
        ]}
      />

      {notice ? (
        <div
          className={cn(
            "mb-4 rounded-lg px-3 py-2 text-sm",
            notice.tone === "error" ? "bg-red-50 text-red-700" : "bg-muted text-stone-700",
          )}
        >
          {notice.text}
        </div>
      ) : null}

      {tab === "plan" ? (
        <>
          <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <RunOfShow
              session={session}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={addActivity}
            />
            {selected ? (
              <ActivityEditor
                key={selected.id}
                activity={selected}
                activities={session.activities}
                materials={materials}
                labWorkspaces={labWorkspaces}
                index={session.activities.findIndex((activity) => activity.id === selected.id)}
                total={session.activities.length}
                onChange={(patch) => updateActivity(selected.id, patch)}
                onMove={(direction) => moveActivity(selected.id, direction)}
                onRemove={() => removeActivity(selected.id)}
              />
            ) : (
              <EmptyState icon={Layers} title="Add the first activity" />
            )}
          </div>
          <SaveBar dirty={dirty} saving={saving} onSave={savePlan} label="Save plan" />
        </>
      ) : null}

      {tab === "settings" ? (
        <>
          <SessionSettings session={session} onSession={updateSession} onSettings={updateSettings} />
          <SaveBar dirty={dirty} saving={saving} onSave={savePlan} label="Save settings" />
        </>
      ) : null}

      {tab === "run" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card padded={false} className="overflow-hidden">
            {current ? (
              <>
                <div className="border-b border-border p-6">
                  <div className="flex items-center justify-between gap-3">
                    <Badge tone={current.status === "open" ? "live" : "neutral"} dot={current.status === "open"}>
                      {current.status === "open" ? "Learners see this now" : "Responses closed"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {activityLabel(current.type)}
                      {current.estimatedMinutes ? ` · ${current.estimatedMinutes} min` : ""}
                    </span>
                  </div>
                  <h2 className="mt-5 text-2xl font-medium tracking-tight">{current.title}</h2>
                  {current.prompt ? (
                    <p className="mt-3 text-base leading-7 text-stone-700">{current.prompt}</p>
                  ) : null}
                  {current.facilitatorNotes ? (
                    <div className="mt-5 rounded-lg bg-amber-50 px-4 py-3">
                      <p className="text-xs font-medium text-amber-700">Private note</p>
                      <p className="mt-1 text-sm leading-6 text-amber-900">{current.facilitatorNotes}</p>
                    </div>
                  ) : null}
                </div>
                {current.materialId ? (
                  <div className="border-b border-border p-4 sm:p-6">
                    <CourseMaterialViewer
                      key={current.id}
                      materialId={current.materialId}
                      initialSlide={current.materialStartSlide}
                      progressKey={current.id}
                      syncMode="controller"
                      compact
                    />
                  </div>
                ) : null}
                {current.labWorkspaceId ? (
                  <div className="border-b border-border p-4 sm:p-6">
                    <LearnerLabWorkspace workspaceId={current.labWorkspaceId} entryPath={current.labEntryPath} compact />
                  </div>
                ) : null}
                <LiveResults
                  activity={current}
                  results={data.results[current.id]}
                  responses={session.responseCounts[current.id] || 0}
                  participants={session.participantCount}
                />
                <div className="flex flex-col gap-3 border-t border-border bg-page px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    icon={LockKeyhole}
                    onClick={() => command("close_activity", current.id)}
                    disabled={running || current.status === "closed"}
                  >
                    Close responses
                  </Button>
                  {nextActivity ? (
                    <Button variant="primary" onClick={() => command("activate", nextActivity.id)} disabled={running}>
                      Next: {nextActivity.title}
                      <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                  ) : (
                    <Button variant="primary" icon={Check} onClick={() => command("end")} disabled={running}>
                      Finish session
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="p-12 text-center">
                <Radio className="mx-auto h-6 w-6 text-stone-300" strokeWidth={1.75} />
                <p className="mt-3 text-sm font-medium">
                  {session.status === "live"
                    ? "No activity is presented"
                    : session.status === "ended"
                      ? "This session has ended"
                      : "The room is ready"}
                </p>
                <div className="mt-4 flex justify-center">
                  {session.status === "draft" ? (
                    <Button variant="primary" icon={MonitorUp} onClick={() => command("open_lobby")}>
                      Open lobby
                    </Button>
                  ) : session.status === "lobby" || session.status === "live" ? (
                    <Button variant="primary" icon={Play} onClick={() => command("start")}>
                      {session.status === "live" ? "Restore first activity" : "Start first activity"}
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </Card>
          <aside className="space-y-4">
            <Card padded={false}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                  {session.participantCount} in the room
                </span>
                <button
                  type="button"
                  onClick={() => setTab("invite")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Join screen
                </button>
              </div>
              <div className="max-h-56 space-y-0.5 overflow-y-auto p-2">
                {data.participants.map((participant) => (
                  <div key={participant.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="truncate text-sm text-stone-700">{participant.displayName}</span>
                  </div>
                ))}
                {!data.participants.length ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nobody has joined yet.</p>
                ) : null}
              </div>
            </Card>
            <Card padded={false}>
              <p className="border-b border-border px-4 py-3 text-sm font-medium">Jump to</p>
              <div className="max-h-[420px] space-y-0.5 overflow-y-auto p-2">
                {session.activities.map((activity, index) => {
                  const partClosed =
                    session.parts.find((part) => part.activityIds.includes(activity.id))?.status === "closed";
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => command("activate", activity.id)}
                      disabled={session.status === "ended" || partClosed}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors disabled:opacity-40",
                        activity.id === current?.id ? "bg-accent" : "hover:bg-muted",
                      )}
                    >
                      <IndexChip value={index + 1} active={activity.id === current?.id} />
                      <span className="min-w-0 flex-1 truncate text-sm">{activity.title}</span>
                      {activity.status === "closed" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </Card>
          </aside>
        </div>
      ) : null}

      {tab === "invite" ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex min-h-[420px] flex-col items-center justify-center rounded-xl bg-stone-900 p-8 text-center text-white sm:p-12">
            <p className="text-sm text-stone-400">Join the live session</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-medium tracking-tight">{session.title}</h2>
            <div className="mt-8 grid items-center gap-8 sm:grid-cols-[200px_1fr] sm:text-left">
              <div className="rounded-xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${qrPath}?format=png`}
                  alt={`QR code to join ${session.title}`}
                  className="aspect-square w-full"
                />
              </div>
              <div>
                <p className="text-sm text-stone-400">Scan, or visit</p>
                <p className="mt-1 break-all text-lg font-medium">{joinPortal}</p>
                <p className="mt-6 text-sm text-stone-400">and enter</p>
                <p className="mt-1 text-5xl font-medium tracking-[0.14em] text-teal-200">
                  {formatCode(session.joinCode)}
                </p>
              </div>
            </div>
          </section>
          <aside className="space-y-4">
            <Card padded={false} className="p-2">
              <ShareLink href={`${qrPath}?format=png&download=1`} icon={Download} label="Download QR (PNG)" />
              <ShareLink href={`${qrPath}?format=svg&download=1`} icon={Download} label="Download QR (SVG)" />
              <ShareQrButton qrUrl={`${qrPath}?format=png`} joinUrl={joinUrl} title={session.title} />
              <CopyButton label="Copy join link" value={joinUrl} icon={Link2} />
              <CopyButton label="Copy code" value={session.joinCode} icon={Clipboard} />
              <ShareLink href={joinUrl} icon={ExternalLink} label="Preview learner view" external />
            </Card>
            <Card>
              <dl className="space-y-2.5 text-sm">
                <ShareRow
                  label="Who can join"
                  value={
                    session.access === "open"
                      ? "Anyone with the link"
                      : session.access === "invited"
                        ? "Invited emails"
                        : "Enrolled learners"
                  }
                />
                <ShareRow label="Late join" value={session.settings.allowLateJoin ? "Allowed" : "Locked after start"} />
                <ShareRow label="Learner copilot" value={session.settings.learnerCopilot.enabled ? "On" : "Off"} />
              </dl>
              <button
                type="button"
                onClick={() => setTab("settings")}
                className="mt-4 text-xs text-muted-foreground hover:text-foreground"
              >
                Change in settings
              </button>
            </Card>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function RunOfShow({
  session,
  selectedId,
  onSelect,
  onAdd,
}: {
  session: LiveSessionRecord;
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: (type: LiveActivityType) => void;
}) {
  // Group activities under programme sessions when the room has them.
  const groups = useMemo(() => {
    const indexOf = new Map(session.activities.map((activity, index) => [activity.id, index]));
    if (!session.parts.length) {
      return [{ id: "all", title: "", items: session.activities }];
    }
    const assigned = new Set(session.parts.flatMap((part) => part.activityIds));
    const partGroups = session.parts.map((part) => ({
      id: part.id,
      title: part.title,
      items: part.activityIds
        .map((id) => session.activities.find((activity) => activity.id === id))
        .filter((activity): activity is LiveActivity => Boolean(activity))
        .sort((a, b) => (indexOf.get(a.id) || 0) - (indexOf.get(b.id) || 0)),
    }));
    const loose = session.activities.filter((activity) => !assigned.has(activity.id));
    return loose.length ? [...partGroups, { id: "loose", title: "Not in a session", items: loose }] : partGroups;
  }, [session.activities, session.parts]);
  const numberOf = (id: string) => session.activities.findIndex((activity) => activity.id === id) + 1;

  return (
    <aside className="rounded-xl border border-border bg-white shadow-card lg:sticky lg:top-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">Run of show</span>
          <InfoTip>Learners see this sequence as their workbook.</InfoTip>
        </div>
        <Popover
          align="end"
          className="w-64 p-1.5"
          trigger={({ toggle }) => <IconButton label="Add activity" icon={Plus} size="sm" onClick={toggle} />}
        >
          {({ close }) => (
            <div className="max-h-80 overflow-y-auto">
              {activityChoices.map((choice) => (
                <button
                  key={choice.type}
                  type="button"
                  onClick={() => {
                    onAdd(choice.type);
                    close();
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="block text-sm">{choice.label}</span>
                  <span className="block text-xs text-muted-foreground">{choice.hint}</span>
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>
      <div className="max-h-[calc(100dvh-17rem)] overflow-y-auto p-2">
        {groups.map((group) => (
          <div key={group.id} className="mb-1">
            {group.title ? (
              <p className="truncate px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">{group.title}</p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((activity) => (
                <NavItem
                  key={activity.id}
                  active={selectedId === activity.id}
                  onClick={() => onSelect(activity.id)}
                  leading={<IndexChip value={numberOf(activity.id)} active={selectedId === activity.id} />}
                  title={activity.title}
                  meta={`${activityLabel(activity.type)}${activity.estimatedMinutes ? ` · ${activity.estimatedMinutes} min` : ""}`}
                />
              ))}
            </div>
          </div>
        ))}
        {!session.activities.length ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No activities yet.</p>
        ) : null}
      </div>
    </aside>
  );
}

/** Compact control for programme sessions: open, close and pace each part. */
function ProgrammeMenu({
  parts,
  running,
  onOpen,
  onClose,
  onPaceChange,
}: {
  parts: LiveSessionPart[];
  running: boolean;
  onOpen: (partId: string) => void;
  onClose: (partId: string) => void;
  onPaceChange: (partId: string, pace: LiveSessionPart["pace"]) => void;
}) {
  const openCount = parts.filter((part) => part.status === "open").length;
  return (
    <Popover
      align="end"
      className="w-[360px] p-0"
      trigger={({ open, toggle }) => (
        <Button icon={Layers} onClick={toggle} aria-expanded={open}>
          Programme
          <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
            {openCount}/{parts.length} open
          </span>
        </Button>
      )}
    >
      <div className="flex items-center gap-1 border-b border-border px-4 py-3">
        <span className="text-sm font-medium">Programme sessions</span>
        <InfoTip>
          Learners keep one link. Open any combination of sessions, and choose whether each one is educator guided or
          self-guided.
        </InfoTip>
      </div>
      <div className="max-h-[60vh] divide-y divide-border overflow-y-auto">
        {parts.map((part, index) => {
          const open = part.status === "open";
          return (
            <div key={part.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <IndexChip value={index + 1} active={open} />
                <span className="min-w-0 flex-1 truncate text-sm">{part.title}</span>
                <Switch
                  checked={open}
                  disabled={running}
                  label={`${part.title} open to learners`}
                  onChange={(checked) => (checked ? onOpen(part.id) : onClose(part.id))}
                />
              </div>
              <div className="mt-2 pl-9">
                <select
                  value={part.pace}
                  disabled={running}
                  onChange={(event) => onPaceChange(part.id, event.target.value as LiveSessionPart["pace"])}
                  aria-label={`${part.title} pace`}
                  className="rounded-md border-0 bg-muted px-2 py-1 text-xs text-stone-600 outline-none"
                >
                  <option value="learner">Self-guided</option>
                  <option value="facilitator">Educator guided</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </Popover>
  );
}

function SessionSettings({
  session,
  onSession,
  onSettings,
}: {
  session: LiveSessionRecord;
  onSession: (patch: Partial<LiveSessionRecord>) => void;
  onSettings: (patch: Partial<LiveSessionRecord["settings"]>) => void;
}) {
  const [view, setView] = useState<"general" | "copilot">("general");
  const copilot = session.settings.learnerCopilot;
  const setCopilot = (patch: Partial<typeof copilot>) =>
    onSettings({ learnerCopilot: { ...copilot, ...patch } });

  return (
    <div className="max-w-3xl space-y-5">
      <Segmented
        items={[
          { value: "general", label: "General" },
          { value: "copilot", label: "Learner copilot" },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "general" ? (
        <>
          <Card className="space-y-4">
            <Field label="Session title">
              <Input value={session.title} onChange={(event) => onSession({ title: event.target.value })} />
            </Field>
            <FieldGrid>
              <Field label="Who can join">
                <Select
                  value={session.access}
                  onChange={(event) => onSession({ access: event.target.value as LiveSessionRecord["access"] })}
                >
                  <option value="enrolled">Enrolled learners</option>
                  <option value="invited">Invited email addresses</option>
                  <option value="open">Anyone with the link</option>
                </Select>
              </Field>
              <Field label="Scheduled start" optional>
                <Input
                  type="datetime-local"
                  value={toDateTimeLocal(session.scheduledStart)}
                  onChange={(event) =>
                    onSession({
                      scheduledStart: event.target.value ? new Date(event.target.value).toISOString() : undefined,
                    })
                  }
                />
              </Field>
              {session.parts.length ? null : (
                <Field label="Pace">
                  <Select
                    value={session.pace}
                    onChange={(event) => onSession({ pace: event.target.value as LiveSessionRecord["pace"] })}
                  >
                    <option value="facilitator">You control each step</option>
                    <option value="learner">Learners move at their own pace</option>
                  </Select>
                </Field>
              )}
            </FieldGrid>
            {session.access === "invited" ? (
              <Field label="Invited emails" info="One per line, or separated by commas.">
                <Textarea
                  rows={3}
                  placeholder="name@example.com"
                  value={session.invitedEmails.join("\n")}
                  onChange={(event) =>
                    onSession({
                      invitedEmails: event.target.value
                        .split(/[\n,;]/)
                        .map((email) => email.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            ) : null}
          </Card>
          <Card className="divide-y divide-border py-2">
            <SwitchRow
              label="Allow late join"
              checked={session.settings.allowLateJoin}
              onChange={(allowLateJoin) => onSettings({ allowLateJoin })}
            />
            <SwitchRow
              label="Show names in private results"
              checked={session.settings.showParticipantNames}
              onChange={(showParticipantNames) => onSettings({ showParticipantNames })}
            />
            <SwitchRow
              label="Leaderboard"
              checked={session.settings.showLeaderboard}
              onChange={(showLeaderboard) => onSettings({ showLeaderboard })}
            />
          </Card>
        </>
      ) : (
        <>
          <Card className="py-2">
            <SwitchRow
              label="Available to learners"
              info="Hidden quiz answers and private facilitator notes are never shared with the learner copilot."
              checked={copilot.enabled}
              onChange={(enabled) => setCopilot({ enabled })}
            />
          </Card>
          <Card className={cn("divide-y divide-border py-2", !copilot.enabled && "opacity-60")}>
            <SwitchRow
              label="Explain the current activity"
              description="Clarify the visible prompt, instructions and concepts."
              checked={copilot.explainCurrentActivity}
              disabled={!copilot.enabled}
              onChange={(explainCurrentActivity) => setCopilot({ explainCurrentActivity })}
            />
            <SwitchRow
              label="Coach learner responses"
              description="Questions and hints, without writing answers."
              checked={copilot.coachResponses}
              disabled={!copilot.enabled}
              onChange={(coachResponses) => setCopilot({ coachResponses })}
            />
            <SwitchRow
              label="Use wider course material"
              description="Draw on material beyond the current activity."
              checked={copilot.useCourseMaterials}
              disabled={!copilot.enabled}
              onChange={(useCourseMaterials) => setCopilot({ useCourseMaterials })}
            />
            <SwitchRow
              label="Give direct explanations"
              description="Explain directly instead of always starting with hints."
              checked={copilot.giveDirectExplanations}
              disabled={!copilot.enabled}
              onChange={(giveDirectExplanations) => setCopilot({ giveDirectExplanations })}
            />
          </Card>
        </>
      )}
    </div>
  );
}

type EditorTab = "content" | "responses" | "resources" | "notes";

function hasResponseDesign(type: LiveActivityType) {
  return [
    "poll",
    "quiz",
    "setup_check",
    "prioritization",
    "worksheet",
    "card_collection",
    "linked_scorecard",
  ].includes(type);
}

function ActivityEditor({
  activity,
  activities,
  materials,
  labWorkspaces,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  activity: LiveActivity;
  activities: LiveActivity[];
  materials: CourseMaterialRecord[];
  labWorkspaces: LabWorkspaceRecord[];
  index: number;
  total: number;
  onChange: (patch: Partial<LiveActivity>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [tab, setTab] = useState<EditorTab>("content");
  const responses = hasResponseDesign(activity.type);
  const activeTab = tab === "responses" && !responses ? "content" : tab;

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge>
            {index + 1} of {total} · {activityLabel(activity.type)}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Move up" icon={ArrowUp} size="sm" onClick={() => onMove(-1)} disabled={index === 0} />
          <IconButton label="Move down" icon={ArrowDown} size="sm" onClick={() => onMove(1)} disabled={index === total - 1} />
          <IconButton label="Remove activity" icon={Trash2} size="sm" onClick={onRemove} />
        </div>
      </div>
      <Tabs
        className="mb-5"
        value={activeTab}
        onChange={setTab}
        items={[
          { value: "content", label: "Content" },
          { value: "responses", label: "Responses", hidden: !responses },
          { value: "resources", label: "Resources" },
          { value: "notes", label: "Notes" },
        ]}
      />

      {activeTab === "content" ? (
        <Card className="space-y-4">
          <Field label="Title">
            <Input value={activity.title} onChange={(event) => onChange({ title: event.target.value })} />
          </Field>
          <FieldGrid>
            <Field label="Type">
              <Select
                value={activity.type}
                onChange={(event) => onChange({ type: event.target.value as LiveActivityType })}
              >
                {activityChoices.map((choice) => (
                  <option key={choice.type} value={choice.type}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Minutes">
              <Input
                type="number"
                min={1}
                value={activity.estimatedMinutes || ""}
                onChange={(event) => onChange({ estimatedMinutes: Number(event.target.value) || undefined })}
              />
            </Field>
          </FieldGrid>
          <Field label="Prompt or key idea">
            <Textarea rows={3} value={activity.prompt || ""} onChange={(event) => onChange({ prompt: event.target.value })} />
          </Field>
          <Field label="Learner instructions" optional>
            <Textarea
              rows={4}
              value={activity.instructions || ""}
              onChange={(event) => onChange({ instructions: event.target.value })}
            />
          </Field>
          {activity.type === "task" || activity.type === "reflection" ? (
            <Field label="Success criteria" optional>
              <Textarea
                rows={2}
                value={activity.successCriteria || ""}
                onChange={(event) => onChange({ successCriteria: event.target.value })}
              />
            </Field>
          ) : null}
        </Card>
      ) : null}

      {activeTab === "responses" ? (
        <ResponseDesign activity={activity} activities={activities} onChange={onChange} />
      ) : null}

      {activeTab === "resources" ? (
        <ResourcesEditor
          activity={activity}
          materials={materials}
          labWorkspaces={labWorkspaces}
          onChange={onChange}
        />
      ) : null}

      {activeTab === "notes" ? (
        <div className="space-y-4">
          <Card>
            <Field label="Private facilitator notes" info="Only you see these, including while running the room.">
              <Textarea
                rows={5}
                value={activity.facilitatorNotes || ""}
                onChange={(event) => onChange({ facilitatorNotes: event.target.value })}
              />
            </Field>
          </Card>
          <Card className="divide-y divide-border py-2">
            <SwitchRow
              label="Required"
              info="Learners must complete this activity to finish the workbook."
              checked={activity.required}
              onChange={(required) => onChange({ required })}
            />
            {activity.type === "quiz" ? (
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm">Points</span>
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  value={activity.points}
                  onChange={(event) => onChange({ points: Number(event.target.value) || 0 })}
                />
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function ResourcesEditor({
  activity,
  materials,
  labWorkspaces,
  onChange,
}: {
  activity: LiveActivity;
  materials: CourseMaterialRecord[];
  labWorkspaces: LabWorkspaceRecord[];
  onChange: (patch: Partial<LiveActivity>) => void;
}) {
  const selectedLabWorkspace = labWorkspaces.find((workspace) => workspace.id === activity.labWorkspaceId);
  const learnerLabFiles = (selectedLabWorkspace?.files || []).filter((file) => file.audience === "learner");
  const labFolders = labWorkspaceFolderPaths(learnerLabFiles);

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <SectionTitle title="Slides or document" />
        <FieldGrid>
          <Field label="Material">
            <Select
              value={activity.materialId || ""}
              onChange={(event) => onChange({ materialId: event.target.value || undefined })}
            >
              <option value="">None</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </Select>
          </Field>
          {activity.materialId ? (
            <Field label="Start at slide" info="The deck opens here when this activity is presented.">
              <Input
                type="number"
                min={1}
                max={500}
                value={activity.materialStartSlide || 1}
                onChange={(event) =>
                  onChange({ materialStartSlide: Math.max(1, Number(event.target.value) || 1) })
                }
              />
            </Field>
          ) : null}
        </FieldGrid>
      </Card>
      <Card className="space-y-4">
        <SectionTitle title="Lab workspace" />
        <FieldGrid>
          <Field label="Lab">
            <Select
              value={activity.labWorkspaceId || ""}
              onChange={(event) =>
                onChange({ labWorkspaceId: event.target.value || undefined, labEntryPath: undefined })
              }
            >
              <option value="">None</option>
              {labWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.title}
                </option>
              ))}
            </Select>
          </Field>
          {selectedLabWorkspace ? (
            <Field label="Open learners at" info="Learners land here when this activity is presented.">
              <Select
                value={activity.labEntryPath || ""}
                onChange={(event) => onChange({ labEntryPath: event.target.value || undefined })}
              >
                <option value="">Workspace home</option>
                {labFolders.length ? (
                  <optgroup label="Folders">
                    {labFolders.map((path) => (
                      <option key={path} value={path}>
                        {labPathLabel(path)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {learnerLabFiles.length ? (
                  <optgroup label="Files">
                    {learnerLabFiles.map((file) => (
                      <option key={file.id} value={file.path}>
                        {labPathLabel(file.path)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            </Field>
          ) : null}
        </FieldGrid>
      </Card>
      <Card>
        <Field label="External link" optional>
          <Input
            type="url"
            placeholder="https://"
            value={activity.resourceUrl || ""}
            onChange={(event) => onChange({ resourceUrl: event.target.value })}
          />
        </Field>
      </Card>
    </div>
  );
}

function ResponseDesign({
  activity,
  activities,
  onChange,
}: {
  activity: LiveActivity;
  activities: LiveActivity[];
  onChange: (patch: Partial<LiveActivity>) => void;
}) {
  function updateOption(id: string, patch: Partial<LiveActivity["options"][number]>) {
    onChange({ options: activity.options.map((option) => (option.id === id ? { ...option, ...patch } : option)) });
  }
  function updateWorksheetField(id: string, patch: Partial<LiveWorksheetField>) {
    onChange({
      worksheetFields: (activity.worksheetFields || []).map((field) =>
        field.id === id ? { ...field, ...patch } : field,
      ),
    });
  }
  function updateCriterion(id: string, patch: Partial<NonNullable<LiveActivity["scoreCriteria"]>[number]>) {
    onChange({
      scoreCriteria: (activity.scoreCriteria || []).map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  if (["poll", "quiz", "setup_check"].includes(activity.type)) {
    return (
      <div className="space-y-4">
        <Card>
          <SectionTitle
            title="Options"
            info={activity.type === "quiz" ? "Tick the correct answer." : undefined}
            action={
              <Button
                size="sm"
                icon={Plus}
                onClick={() =>
                  onChange({
                    options: [
                      ...activity.options,
                      { id: crypto.randomUUID(), label: `Option ${activity.options.length + 1}`, isCorrect: false },
                    ],
                  })
                }
              >
                Add
              </Button>
            }
          />
          <div className="space-y-2">
            {activity.options.map((option) => (
              <div key={option.id} className="flex items-center gap-2">
                {activity.type === "quiz" ? (
                  <button
                    type="button"
                    onClick={() => updateOption(option.id, { isCorrect: !option.isCorrect })}
                    title="Mark as correct"
                    aria-label="Mark as correct"
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      option.isCorrect
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-border text-stone-300 hover:text-stone-500",
                    )}
                  >
                    <Check className="h-4 w-4" strokeWidth={2} />
                  </button>
                ) : null}
                <Input value={option.label} onChange={(event) => updateOption(option.id, { label: event.target.value })} />
                <IconButton
                  label="Remove option"
                  icon={Trash2}
                  size="sm"
                  onClick={() => onChange({ options: activity.options.filter((item) => item.id !== option.id) })}
                />
              </div>
            ))}
          </div>
        </Card>
        <Card className="divide-y divide-border py-2">
          <SwitchRow
            label="Shuffle for each learner"
            checked={activity.randomizeOptions}
            onChange={(randomizeOptions) => onChange({ randomizeOptions })}
          />
          <SwitchRow
            label="Show results after closing"
            checked={activity.showResults}
            onChange={(showResults) => onChange({ showResults })}
          />
          {activity.type === "poll" ? (
            <>
              <SwitchRow
                label="Allow a typed Other answer"
                checked={Boolean(activity.allowOther)}
                onChange={(allowOther) => onChange({ allowOther })}
              />
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm">Layout</span>
                <Select
                  className="w-auto"
                  value={activity.responseStyle || "cards"}
                  onChange={(event) =>
                    onChange({ responseStyle: event.target.value === "scale" ? "scale" : "cards" })
                  }
                >
                  <option value="cards">Choice cards</option>
                  <option value="scale">Compact scale</option>
                </Select>
              </div>
            </>
          ) : null}
        </Card>
      </div>
    );
  }

  if (activity.type === "prioritization") {
    return (
      <Card className="space-y-4">
        <SectionTitle
          title="Capture and shortlist"
          info="Learners can add up to 50 entries, save progress, and revise their shortlist while the activity is open."
        />
        <FieldGrid>
          <Field label="Entry prompt">
            <Input
              placeholder="Add a routine"
              value={activity.entryLabel || ""}
              onChange={(event) => onChange({ entryLabel: event.target.value })}
            />
          </Field>
          <Field label="Selection prompt">
            <Input
              placeholder="Choose what to take forward"
              value={activity.selectionPrompt || ""}
              onChange={(event) => onChange({ selectionPrompt: event.target.value })}
            />
          </Field>
          <Field label="Minimum entries">
            <Input
              type="number"
              min={1}
              max={50}
              value={activity.minItems || 3}
              onChange={(event) =>
                onChange({ minItems: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })
              }
            />
          </Field>
          <Field label="Shortlist size">
            <Input
              type="number"
              min={1}
              max={10}
              value={activity.maxSelections || 3}
              onChange={(event) =>
                onChange({ maxSelections: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })
              }
            />
          </Field>
        </FieldGrid>
      </Card>
    );
  }

  if (activity.type === "worksheet" || activity.type === "card_collection") {
    const fields = activity.worksheetFields || [];
    return (
      <div className="space-y-4">
        {activity.type === "card_collection" ? (
          <Card>
            <FieldGrid>
              <Field label="Card title field">
                <Select
                  value={activity.itemTitleFieldId || ""}
                  onChange={(event) => onChange({ itemTitleFieldId: event.target.value })}
                >
                  <option value="">Choose a field</option>
                  {fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Minimum cards">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={activity.minItems || 1}
                  onChange={(event) =>
                    onChange({ minItems: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })
                  }
                />
              </Field>
            </FieldGrid>
          </Card>
        ) : null}
        <SectionTitle
          title={activity.type === "card_collection" ? "Fields on every card" : "Worksheet fields"}
          info={
            activity.type === "card_collection"
              ? "Learners can create up to 50 cards with this structure."
              : "Group related questions by giving them the same section title."
          }
          action={
            <Button
              size="sm"
              icon={Plus}
              onClick={() =>
                onChange({
                  worksheetFields: [
                    ...fields,
                    { id: crypto.randomUUID(), label: "New question", type: "short_text", required: false },
                  ],
                })
              }
            >
              Add field
            </Button>
          }
        />
        <div className="space-y-2">
          {fields.map((field, fieldIndex) => (
            <WorksheetFieldRow
              key={field.id}
              index={fieldIndex}
              field={field}
              onChange={(patch) => updateWorksheetField(field.id, patch)}
              onRemove={() =>
                onChange({ worksheetFields: fields.filter((candidate) => candidate.id !== field.id) })
              }
            />
          ))}
        </div>
      </div>
    );
  }

  if (activity.type === "linked_scorecard") {
    const criteria = activity.scoreCriteria || [];
    return (
      <div className="space-y-4">
        <Card>
          <Field label="Cards to score" info="Learners score the cards they captured in an earlier repeatable-card activity.">
            <Select
              value={activity.sourceActivityId || ""}
              onChange={(event) => onChange({ sourceActivityId: event.target.value })}
            >
              <option value="">Choose repeatable cards</option>
              {activities
                .filter((item) => item.type === "card_collection" && item.id !== activity.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </Select>
          </Field>
        </Card>
        <SectionTitle
          title="Scoring criteria"
          action={
            <Button
              size="sm"
              icon={Plus}
              onClick={() =>
                onChange({
                  scoreCriteria: [...criteria, { id: crypto.randomUUID(), label: "New criterion", min: 1, max: 5 }],
                })
              }
            >
              Add criterion
            </Button>
          }
        />
        <div className="space-y-2">
          {criteria.map((criterion) => (
            <Card key={criterion.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <Input value={criterion.label} onChange={(event) => updateCriterion(criterion.id, { label: event.target.value })} />
                <IconButton
                  label="Remove criterion"
                  icon={Trash2}
                  size="sm"
                  onClick={() => onChange({ scoreCriteria: criteria.filter((item) => item.id !== criterion.id) })}
                />
              </div>
              <FieldGrid columns={3}>
                <Field label="Help text" optional>
                  <Input
                    value={criterion.description || ""}
                    onChange={(event) => updateCriterion(criterion.id, { description: event.target.value })}
                  />
                </Field>
                <Field label="Low label" optional>
                  <Input
                    value={criterion.lowLabel || ""}
                    onChange={(event) => updateCriterion(criterion.id, { lowLabel: event.target.value })}
                  />
                </Field>
                <Field label="High label" optional>
                  <Input
                    value={criterion.highLabel || ""}
                    onChange={(event) => updateCriterion(criterion.id, { highLabel: event.target.value })}
                  />
                </Field>
              </FieldGrid>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function WorksheetFieldRow({
  index,
  field,
  onChange,
  onRemove,
}: {
  index: number;
  field: LiveWorksheetField;
  onChange: (patch: Partial<LiveWorksheetField>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const typeLabels: Record<LiveWorksheetField["type"], string> = {
    short_text: "Short answer",
    long_text: "Long answer",
    scale: "Number scale",
    date: "Date",
  };
  return (
    <div className="rounded-xl border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <IndexChip value={index + 1} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{field.label || "Untitled field"}</span>
          <span className="block text-xs text-muted-foreground">
            {typeLabels[field.type]}
            {field.section ? ` · ${field.section}` : ""}
            {field.required ? " · required" : ""}
          </span>
        </span>
        <ChevronRight
          className={cn("h-4 w-4 text-stone-300 transition-transform", open && "rotate-90")}
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <FieldGrid>
            <Field label="Question">
              <Input value={field.label} onChange={(event) => onChange({ label: event.target.value })} />
            </Field>
            <Field label="Answer type">
              <Select
                value={field.type}
                onChange={(event) => onChange({ type: event.target.value as LiveWorksheetField["type"] })}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Section" optional>
              <Input
                placeholder="Group heading"
                value={field.section || ""}
                onChange={(event) => onChange({ section: event.target.value })}
              />
            </Field>
            <Field label="Help text" optional>
              <Input value={field.description || ""} onChange={(event) => onChange({ description: event.target.value })} />
            </Field>
            {field.type === "scale" ? (
              <>
                <Field label="Minimum">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={field.min ?? 1}
                    onChange={(event) => onChange({ min: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Maximum">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={field.max ?? 5}
                    onChange={(event) => onChange({ max: Number(event.target.value) })}
                  />
                </Field>
              </>
            ) : null}
          </FieldGrid>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={field.required} onChange={(required) => onChange({ required })} label="Required" />
              Required
            </label>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LiveResults({
  activity,
  results,
  responses,
  participants,
}: {
  activity: LiveActivity;
  results?: LiveActivityResults;
  responses: number;
  participants: number;
}) {
  const rate = participants ? Math.round((responses / participants) * 100) : 0;
  const hasStructured =
    Boolean(results?.prioritizations?.length) ||
    Boolean(results?.worksheets?.length) ||
    Boolean(results?.cardCollections?.length) ||
    Boolean(results?.scorecards?.length);
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {responses} of {participants} responded
        </p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.75} /> {rate}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${rate}%` }} />
      </div>

      {activity.options.length ? (
        <div className="mt-5 space-y-3">
          {activity.options.map((option) => {
            const count = results?.options?.find((item) => item.id === option.id)?.count || 0;
            const width = responses ? Math.round((count / responses) * 100) : 0;
            return (
              <div key={option.id}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-stone-700">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {count} · {width}%
                  </span>
                </div>
                <div className="mt-1 h-6 overflow-hidden rounded-md bg-muted">
                  <div
                    className={cn("h-full rounded-md transition-all", option.isCorrect ? "bg-emerald-300" : "bg-stone-300")}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {results?.textResponses?.length ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {results.textResponses.slice(-20).map((response) => (
            <div key={response.id} className="rounded-lg bg-page px-3 py-2.5">
              <p className="text-sm leading-6 text-stone-700">{response.value}</p>
              {response.participantName ? (
                <p className="mt-1 text-xs text-muted-foreground">{response.participantName}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : !activity.options.length && !hasStructured ? (
        <p className="mt-5 rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Responses will appear here.
        </p>
      ) : null}

      {hasStructured ? (
        <div className="mt-5 space-y-2">
          {results?.prioritizations?.map((response) => (
            <ResponseDetails
              key={response.id}
              name={response.participantName}
              status={response.finalized ? "Shortlist ready" : "In progress"}
            >
              <div className="flex flex-wrap gap-1.5">
                {response.selectedItems.map((item) => (
                  <Badge key={item} tone="success">
                    {item}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{response.items.length} captured</p>
            </ResponseDetails>
          ))}
          {results?.worksheets?.map((response) => (
            <ResponseDetails
              key={response.id}
              name={response.participantName}
              status={`${response.finalized ? "Completed" : "In progress"} · ${response.values.length} fields`}
            >
              <dl className="space-y-3">
                {response.values.map((answer) => (
                  <div key={answer.fieldId}>
                    <dt className="text-xs text-muted-foreground">{answer.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-stone-700">{answer.value}</dd>
                  </div>
                ))}
              </dl>
            </ResponseDetails>
          ))}
          {results?.cardCollections?.map((response) => (
            <ResponseDetails
              key={response.id}
              name={response.participantName}
              status={`${response.finalized ? "Completed" : "In progress"} · ${response.items.length} cards`}
            >
              <div className="space-y-2">
                {response.items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-white p-3">
                    <p className="text-sm font-medium">{item.title}</p>
                    <dl className="mt-2 grid gap-2 md:grid-cols-2">
                      {item.values.map((answer) => (
                        <div key={answer.fieldId}>
                          <dt className="text-xs text-muted-foreground">{answer.label}</dt>
                          <dd className="whitespace-pre-wrap text-xs leading-5 text-stone-700">{answer.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </ResponseDetails>
          ))}
          {results?.scorecards?.map((response) => (
            <ResponseDetails
              key={response.id}
              name={response.participantName}
              status={response.finalized ? "Confirmed" : "In progress"}
            >
              <p className="text-sm font-medium">{response.selectedTitle || "Selection in progress"}</p>
              {response.selectionReason ? (
                <p className="mt-1 text-xs leading-5 text-stone-600">{response.selectionReason}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...response.items]
                  .sort((a, b) => b.total - a.total)
                  .map((item) => (
                    <Badge key={item.sourceItemId}>
                      {item.title} · {item.total}
                    </Badge>
                  ))}
              </div>
            </ResponseDetails>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResponseDetails({
  name,
  status,
  children,
}: {
  name?: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-border bg-page">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm">{name || "Learner"}</span>
        <span className="text-xs text-muted-foreground">{status}</span>
        <ChevronRight className="h-4 w-4 text-stone-300 transition-transform group-open:rotate-90" strokeWidth={1.75} />
      </summary>
      <div className="border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

function ShareLink({
  href,
  icon: Icon,
  label,
  external,
}: {
  href: string;
  icon: typeof Link2;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      download={external ? undefined : true}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-stone-700 transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      {label}
    </a>
  );
}

function CopyButton({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Link2 }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      <span className="flex-1">{copied ? "Copied" : label}</span>
      {copied ? <Check className="h-4 w-4 text-emerald-600" strokeWidth={2} /> : null}
    </button>
  );
}

function ShareQrButton({ qrUrl, joinUrl, title }: { qrUrl: string; joinUrl: string; title: string }) {
  const [status, setStatus] = useState<"idle" | "sharing" | "copied">("idle");
  async function share() {
    if (status === "sharing") return;
    setStatus("sharing");
    try {
      if (navigator.share) {
        const response = await fetch(qrUrl);
        const blob = response.ok ? await response.blob() : null;
        const file = blob ? new File([blob], "live-session-qr.png", { type: "image/png" }) : null;
        if (file && navigator.canShare?.({ files: [file] }))
          await navigator.share({ title, text: "Scan this QR code to join the live session.", files: [file] });
        else await navigator.share({ title, text: "Join the live session", url: joinUrl });
        setStatus("idle");
        return;
      }
      await navigator.clipboard.writeText(joinUrl);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1500);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        await navigator.clipboard.writeText(joinUrl).catch(() => undefined);
        setStatus("copied");
        window.setTimeout(() => setStatus("idle"), 1500);
      } else setStatus("idle");
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-muted"
    >
      <Share2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      <span className="flex-1">
        {status === "sharing" ? "Preparing QR code" : status === "copied" ? "Join link copied" : "Share QR code"}
      </span>
      {status === "sharing" ? <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      {status === "copied" ? <Check className="h-4 w-4 text-emerald-600" strokeWidth={2} /> : null}
    </button>
  );
}

function ShareRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function activityLabel(type: LiveActivityType) {
  return activityChoices.find((choice) => choice.type === type)?.label || type;
}

function labPathLabel(path: string) {
  return path
    .split("/")
    .map((segment) => segment.replace(/\.[^.]+$/, "").replace(/^\d+_/, "").replaceAll("_", " "))
    .join(" › ");
}

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

