"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleStop,
  Clipboard,
  Download,
  ExternalLink,
  GripVertical,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MonitorUp,
  MoreHorizontal,
  Play,
  Plus,
  QrCode,
  Radio,
  Save,
  Settings2,
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
} from "@/types/live-session";
import type { CourseMaterialRecord } from "@/types/course-material";
import type { LabWorkspaceRecord } from "@/types/lab-workspace";
import { CourseMaterialViewer } from "@/components/course-material-viewer";
import { LearnerLabWorkspace } from "@/components/labs/learner-lab-workspace";

type StudioData = {
  session: LiveSessionRecord;
  participants: LiveParticipantRecord[];
  results: Record<string, LiveActivityResults>;
};

const activityChoices: Array<{
  type: LiveActivityType;
  label: string;
  hint: string;
}> = [
  {
    type: "content",
    label: "Workbook page",
    hint: "Notes, examples, and resources",
  },
  {
    type: "setup_check",
    label: "Setup check",
    hint: "Catch blockers before teaching",
  },
  { type: "poll", label: "Poll", hint: "Diagnostic, pulse, or opinion" },
  { type: "quiz", label: "Quiz", hint: "Retrieval with a correct answer" },
  {
    type: "reflection",
    label: "Reflection",
    hint: "Open response or exit ticket",
  },
  {
    type: "task",
    label: "Practice task",
    hint: "Instructions and evidence hand-in",
  },
  { type: "break", label: "Break", hint: "Keep timing visible" },
];

export function LiveFacilitatorStudio({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<StudioData | null>(null);
  const [tab, setTab] = useState<"plan" | "facilitate" | "share">("plan");
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [materials, setMaterials] = useState<CourseMaterialRecord[]>([]);
  const [labWorkspaces, setLabWorkspaces] = useState<LabWorkspaceRecord[]>([]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setNotice("");
      const res = await fetch(`/api/educator/live-sessions/${sessionId}`, {
        cache: "no-store",
      });
      const next = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!quiet) setNotice(next.error || "Could not load this session.");
        return;
      }
      setData(next);
      setSelectedId(
        (current) => current || next.session.activities[0]?.id || "",
      );
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
    void fetch(`/api/educator/courses/${slug}/lab-workspaces`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => setLabWorkspaces(body?.workspaces || []));
  }, [data?.session.courseSlug]);
  useEffect(() => {
    if (
      tab === "plan" ||
      (data?.session.status !== "live" && data?.session.status !== "lobby")
    )
      return;
    const interval = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(interval);
  }, [data?.session.status, load, tab]);

  const selected = data?.session.activities.find(
    (activity) => activity.id === selectedId,
  );
  const current = data?.session.activities.find(
    (activity) => activity.id === data.session.currentActivityId,
  );
  const currentIndex = current
    ? data!.session.activities.findIndex(
        (activity) => activity.id === current.id,
      )
    : -1;
  const nextActivity = data?.session.activities[currentIndex + 1];

  function updateSession(patch: Partial<LiveSessionRecord>) {
    setData((currentData) =>
      currentData
        ? { ...currentData, session: { ...currentData.session, ...patch } }
        : currentData,
    );
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
    setNotice("");
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
      }),
    });
    const next = await res.json().catch(() => ({}));
    if (res.ok) {
      setData((value) => (value ? { ...value, session: next.session } : value));
      setNotice("Session plan saved.");
    } else setNotice(next.error || "Could not save the session plan.");
    setSaving(false);
  }

  async function command(commandName: string, activityId?: string) {
    if (running) return;
    setRunning(true);
    setNotice("");
    const res = await fetch(`/api/educator/live-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: commandName, activityId }),
    });
    const next = await res.json().catch(() => ({}));
    if (res.ok) {
      setData((currentData) =>
        currentData ? { ...currentData, session: next.session } : currentData,
      );
      const active = next.session?.activities?.find(
        (item: LiveActivity) => item.id === next.session.currentActivityId,
      );
      setNotice(
        commandName === "activate" || commandName === "start"
          ? `Learners are now seeing ${active?.title || "the active activity"}.`
          : commandName === "close_activity"
            ? "Responses are closed. Learners still see this activity while you debrief."
            : commandName === "open_lobby"
              ? "Lobby open. Learners can join; activities remain hidden until you begin."
              : commandName === "end"
                ? "Session ended. Learner responses are saved."
                : "Live room updated.",
      );
      void load(true);
      if (commandName === "open_lobby") setTab("share");
      if (commandName === "start" || commandName === "activate")
        setTab("facilitate");
    } else setNotice(next.error || "Could not update the live room.");
    setRunning(false);
  }

  function addActivity(type: LiveActivityType) {
    if (!data) return;
    const id = crypto.randomUUID();
    const label =
      activityChoices.find((choice) => choice.type === type)?.label ||
      "Activity";
    const activity: LiveActivity = {
      id,
      type,
      title: `New ${label.toLowerCase()}`,
      status: "draft",
      required: false,
      randomizeOptions: type === "quiz",
      showResults: type === "poll" || type === "quiz" || type === "setup_check",
      points: type === "quiz" ? 1 : 0,
      options: ["poll", "quiz", "setup_check"].includes(type)
        ? [
            {
              id: crypto.randomUUID(),
              label: "Option 1",
              isCorrect: type === "quiz",
            },
            { id: crypto.randomUUID(), label: "Option 2", isCorrect: false },
          ]
        : [],
    };
    updateSession({ activities: [...data.session.activities, activity] });
    setSelectedId(id);
    setAddOpen(false);
  }

  function moveActivity(id: string, direction: -1 | 1) {
    if (!data) return;
    const activities = [...data.session.activities];
    const index = activities.findIndex((activity) => activity.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= activities.length) return;
    [activities[index], activities[nextIndex]] = [
      activities[nextIndex],
      activities[index],
    ];
    updateSession({ activities });
  }

  function removeActivity(id: string) {
    if (!data) return;
    const activities = data.session.activities.filter(
      (activity) => activity.id !== id,
    );
    updateSession({ activities });
    setSelectedId(activities[0]?.id || "");
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
        {notice || "Loading live session…"}
      </div>
    );
  }

  const joinPath = `/live/${data.session.id}`;
  const joinUrl =
    typeof window === "undefined"
      ? joinPath
      : `${window.location.origin}${joinPath}`;
  const joinPortal =
    typeof window === "undefined" ? "/join" : `${window.location.origin}/join`;
  const qrPath = `/api/educator/live-sessions/${data.session.id}/qr`;

  return (
    <div
      style={getCourseThemeStyle(data.session.courseTheme) as CSSProperties}
      className="space-y-5"
      data-copilot-target="live-facilitation-studio"
    >
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SessionStatus status={data.session.status} />
            <span className="text-xs text-slate-400">
              Code {formatCode(data.session.joinCode)}
            </span>
          </div>
          <h2 className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950">
            {data.session.title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {data.session.activities.length} activities ·{" "}
            {data.session.participantCount} learners joined
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.session.status === "draft" ? (
            <button
              onClick={() => command("open_lobby")}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <MonitorUp className="h-4 w-4" /> Open room for joining
            </button>
          ) : null}
          {data.session.status === "lobby" ||
          (data.session.status === "live" && !current) ? (
            <button
              onClick={() => command("start")}
              disabled={running || !data.session.activities.length}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              <Play className="h-4 w-4" />{" "}
              {data.session.status === "live"
                ? "Restore live activity"
                : "Present first activity"}
            </button>
          ) : null}
          {data.session.status === "live" ? (
            <button
              onClick={() => command("end")}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50"
            >
              <CircleStop className="h-4 w-4" /> End session
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5">
        <Tab
          active={tab === "plan"}
          onClick={() => setTab("plan")}
          icon={BookOpen}
        >
          Plan
        </Tab>
        <Tab
          active={tab === "facilitate"}
          onClick={() => setTab("facilitate")}
          icon={Radio}
        >
          Facilitate
        </Tab>
        <Tab
          active={tab === "share"}
          onClick={() => setTab("share")}
          icon={QrCode}
        >
          Invite learners
        </Tab>
      </div>

      {notice ? (
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm",
            notice.includes("saved")
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-800",
          )}
        >
          {notice}
        </div>
      ) : null}

      {tab === "plan" ? (
        <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between px-2 py-2">
              <div>
                <p className="text-sm font-bold text-slate-950">Run of show</p>
                <p className="text-xs text-slate-400">
                  Learners see this as a workbook
                </p>
              </div>
              <button
                onClick={() => setAddOpen((value) => !value)}
                className="rounded-lg bg-slate-950 p-2 text-white"
                aria-label="Add activity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {addOpen ? <AddMenu onAdd={addActivity} /> : null}
            <div className="mt-2 space-y-1">
              {data.session.activities.map((activity, index) => (
                <button
                  key={activity.id}
                  onClick={() => setSelectedId(activity.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left",
                    selectedId === activity.id
                      ? "bg-slate-950 text-white"
                      : "hover:bg-slate-50",
                  )}
                >
                  <GripVertical
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selectedId === activity.id
                        ? "text-slate-500"
                        : "text-slate-300",
                    )}
                  />
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {activity.title}
                    </span>
                    <span
                      className={cn(
                        "block text-[10px] uppercase tracking-wide",
                        selectedId === activity.id
                          ? "text-slate-400"
                          : "text-slate-400",
                      )}
                    >
                      {activityLabel(activity.type)}
                      {activity.estimatedMinutes
                        ? ` · ${activity.estimatedMinutes} min`
                        : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
                </button>
              ))}
              {!data.session.activities.length ? (
                <p className="px-3 py-8 text-center text-sm text-slate-400">
                  Add the first learning moment.
                </p>
              ) : null}
            </div>
          </aside>

          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    Session settings
                  </p>
                  <p className="text-xs text-slate-400">
                    One room, adaptable delivery
                  </p>
                </div>
                <Settings2 className="h-4 w-4 text-slate-300" />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Session title">
                  <input
                    value={data.session.title}
                    onChange={(event) =>
                      updateSession({ title: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Delivery pace">
                  <select
                    value={data.session.pace}
                    onChange={(event) =>
                      updateSession({
                        pace: event.target.value as LiveSessionRecord["pace"],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="facilitator">
                      Facilitator controls each step
                    </option>
                    <option value="learner">
                      Learners move at their own pace
                    </option>
                  </select>
                </Field>
                <Field label="Who can join">
                  <select
                    value={data.session.access}
                    onChange={(event) =>
                      updateSession({
                        access: event.target
                          .value as LiveSessionRecord["access"],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="enrolled">Enrolled learners</option>
                    <option value="invited">Invited email addresses</option>
                    <option value="open">Anyone with the link</option>
                  </select>
                </Field>
                <Field label="Scheduled start">
                  <input
                    type="datetime-local"
                    value={toDateTimeLocal(data.session.scheduledStart)}
                    onChange={(event) =>
                      updateSession({
                        scheduledStart: event.target.value
                          ? new Date(event.target.value).toISOString()
                          : undefined,
                      })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
              {data.session.access === "invited" ? (
                <Field label="Invited emails">
                  <textarea
                    value={data.session.invitedEmails.join("\n")}
                    onChange={(event) =>
                      updateSession({
                        invitedEmails: event.target.value
                          .split(/[\n,;]/)
                          .map((email) => email.trim())
                          .filter(Boolean),
                      })
                    }
                    rows={3}
                    placeholder="one@email.com"
                    className={`${inputClass} mt-2 resize-y`}
                  />
                </Field>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-4">
                <Toggle
                  checked={data.session.settings.allowLateJoin}
                  onChange={(value) =>
                    updateSession({
                      settings: {
                        ...data.session.settings,
                        allowLateJoin: value,
                      },
                    })
                  }
                  label="Allow late join"
                />
                <Toggle
                  checked={data.session.settings.showParticipantNames}
                  onChange={(value) =>
                    updateSession({
                      settings: {
                        ...data.session.settings,
                        showParticipantNames: value,
                      },
                    })
                  }
                  label="Names in private results"
                />
                <Toggle
                  checked={data.session.settings.showLeaderboard}
                  onChange={(value) =>
                    updateSession({
                      settings: {
                        ...data.session.settings,
                        showLeaderboard: value,
                      },
                    })
                  }
                  label="Leaderboard"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    Learner copilot
                  </p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                    Choose whether learners can use AI guidance inside this live
                    room, and keep its help within the boundaries of your
                    session.
                  </p>
                </div>
                <Toggle
                  checked={data.session.settings.learnerCopilot.enabled}
                  onChange={(enabled) =>
                    updateSession({
                      settings: {
                        ...data.session.settings,
                        learnerCopilot: {
                          ...data.session.settings.learnerCopilot,
                          enabled,
                        },
                      },
                    })
                  }
                  label={
                    data.session.settings.learnerCopilot.enabled
                      ? "Visible to learners"
                      : "Hidden from learners"
                  }
                />
              </div>
              <div
                className={cn(
                  "mt-5 grid gap-3 md:grid-cols-2",
                  !data.session.settings.learnerCopilot.enabled && "opacity-45",
                )}
              >
                <CopilotPermission
                  title="Explain the current activity"
                  description="Clarify the visible prompt, instructions, and concepts."
                  checked={
                    data.session.settings.learnerCopilot.explainCurrentActivity
                  }
                  disabled={!data.session.settings.learnerCopilot.enabled}
                  onChange={(explainCurrentActivity) =>
                    updateSession({
                      settings: {
                        ...data.session.settings,
                        learnerCopilot: {
                          ...data.session.settings.learnerCopilot,
                          explainCurrentActivity,
                        },
                      },
                    })
                  }
                />
                <CopilotPermission
                  title="Coach learner responses"
                  description="Use questions and hints without writing or submitting answers."
                  checked={data.session.settings.learnerCopilot.coachResponses}
                  disabled={!data.session.settings.learnerCopilot.enabled}
                  onChange={(coachResponses) =>
                    updateSession({
                      settings: {
                        ...data.session.settings,
                        learnerCopilot: {
                          ...data.session.settings.learnerCopilot,
                          coachResponses,
                        },
                      },
                    })
                  }
                />
                <CopilotPermission
                  title="Use wider course material"
                  description="Draw from material beyond the activity currently on screen."
                  checked={
                    data.session.settings.learnerCopilot.useCourseMaterials
                  }
                  disabled={!data.session.settings.learnerCopilot.enabled}
                  onChange={(useCourseMaterials) =>
                    updateSession({
                      settings: {
                        ...data.session.settings,
                        learnerCopilot: {
                          ...data.session.settings.learnerCopilot,
                          useCourseMaterials,
                        },
                      },
                    })
                  }
                />
                <CopilotPermission
                  title="Give direct explanations"
                  description="Explain concepts directly instead of always starting with hints."
                  checked={
                    data.session.settings.learnerCopilot.giveDirectExplanations
                  }
                  disabled={!data.session.settings.learnerCopilot.enabled}
                  onChange={(giveDirectExplanations) =>
                    updateSession({
                      settings: {
                        ...data.session.settings,
                        learnerCopilot: {
                          ...data.session.settings.learnerCopilot,
                          giveDirectExplanations,
                        },
                      },
                    })
                  }
                />
              </div>
              <p className="mt-4 text-[11px] leading-5 text-slate-400">
                Hidden quiz answers and private facilitator notes are never
                available to the learner copilot.
              </p>
            </section>

            {selected ? (
              <ActivityEditor
                activity={selected}
                materials={materials}
                labWorkspaces={labWorkspaces}
                index={data.session.activities.findIndex(
                  (activity) => activity.id === selected.id,
                )}
                onChange={(patch) => updateActivity(selected.id, patch)}
                onMove={(direction) => moveActivity(selected.id, direction)}
                onRemove={() => removeActivity(selected.id)}
              />
            ) : null}
            <div className="sticky bottom-4 flex justify-end">
              <button
                onClick={savePlan}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Save plan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "facilitate" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {current ? (
              <>
                <div className="border-b border-slate-100 p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
                        current.status === "open"
                          ? "bg-red-50 text-red-700"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {current.status === "open"
                        ? "Learners see this now"
                        : "Responses closed · still presented"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {current.estimatedMinutes
                        ? `${current.estimatedMinutes} min`
                        : activityLabel(current.type)}
                    </span>
                  </div>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    {activityLabel(current.type)}
                  </p>
                  <h3 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                    {current.title}
                  </h3>
                  {current.prompt ? (
                    <p className="mt-4 text-lg leading-8 text-slate-700">
                      {current.prompt}
                    </p>
                  ) : null}
                  {current.facilitatorNotes ? (
                    <div className="mt-6 rounded-xl bg-amber-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        Private facilitator note
                      </p>
                      <p className="mt-1 text-sm leading-6 text-amber-900">
                        {current.facilitatorNotes}
                      </p>
                    </div>
                  ) : null}
                </div>
                {current.materialId ? (
                  <div className="border-b border-slate-100 p-4 sm:p-6">
                    <CourseMaterialViewer
                      materialId={current.materialId}
                      compact
                    />
                  </div>
                ) : null}
                {current.labWorkspaceId ? (
                  <div className="border-b border-slate-100 p-4 sm:p-6">
                    <LearnerLabWorkspace
                      workspaceId={current.labWorkspaceId}
                      entryPath={current.labEntryPath}
                      compact
                    />
                  </div>
                ) : null}
                <LiveResults
                  activity={current}
                  results={data.results[current.id]}
                  responses={data.session.responseCounts[current.id] || 0}
                  participants={data.session.participantCount}
                />
                <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <button
                    onClick={() => command("close_activity", current.id)}
                    disabled={running || current.status === "closed"}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-40"
                  >
                    <LockKeyhole className="h-4 w-4" /> Close responses
                  </button>
                  {nextActivity ? (
                    <button
                      onClick={() => command("activate", nextActivity.id)}
                      disabled={running}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
                    >
                      Next: {nextActivity.title}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => command("end")}
                      disabled={running}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
                    >
                      <Check className="h-4 w-4" /> Finish session
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="p-12 text-center">
                <Radio className="mx-auto h-7 w-7 text-slate-300" />
                <h3 className="mt-4 text-lg font-bold text-slate-900">
                  {data.session.status === "live"
                    ? "Restore the live activity"
                    : "The room is ready"}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  {data.session.status === "live"
                    ? "The room is live, but no activity is currently presented. Restore the first activity for everyone."
                    : "Open the lobby, invite learners, then start when the room is settled."}
                </p>
                {data.session.status === "draft" ? (
                  <button
                    onClick={() => command("open_lobby")}
                    className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
                  >
                    Open lobby
                  </button>
                ) : data.session.status === "lobby" ||
                  data.session.status === "live" ? (
                  <button
                    onClick={() => command("start")}
                    className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
                  >
                    {data.session.status === "live"
                      ? "Restore first activity"
                      : "Start first activity"}
                  </button>
                ) : null}
              </div>
            )}
          </section>
          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-950">Room</h3>
                <Users className="h-4 w-4 text-slate-300" />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-slate-950">
                    {data.session.participantCount}
                  </p>
                  <p className="text-xs text-slate-400">learners joined</p>
                </div>
                <button
                  onClick={() => setTab("share")}
                  className="text-xs font-bold text-slate-700 hover:text-slate-950"
                >
                  Show join screen
                </button>
              </div>
              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {data.participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="truncate text-xs font-medium text-slate-700">
                      {participant.displayName}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-950">Run of show</h3>
              <div className="mt-3 space-y-1">
                {data.session.activities.map((activity, index) => (
                  <button
                    key={activity.id}
                    onClick={() => command("activate", activity.id)}
                    disabled={data.session.status === "ended"}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                      activity.id === current?.id
                        ? "bg-slate-950 text-white"
                        : "hover:bg-slate-50",
                    )}
                  >
                    <span className="text-[10px] font-bold opacity-50">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold">
                      {activity.title}
                    </span>
                    {activity.status === "closed" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "share" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-h-[440px] flex-col items-center justify-center rounded-2xl bg-slate-950 p-8 text-center text-white sm:p-12">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#71E0E7]">
              Join the live session
            </p>
            <h3 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
              {data.session.title}
            </h3>
            <div className="mt-8 grid items-center gap-8 sm:grid-cols-[220px_1fr] sm:text-left">
              <div className="rounded-2xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${qrPath}?format=png`}
                  alt={`QR code to join ${data.session.title}`}
                  className="aspect-square w-full"
                />
              </div>
              <div>
                <p className="text-sm text-slate-400">
                  Scan the QR code, or visit
                </p>
                <p className="mt-1 break-all text-lg font-bold">{joinPortal}</p>
                <p className="mt-6 text-sm text-slate-400">Enter code</p>
                <p className="mt-1 text-5xl font-bold tracking-[0.16em] text-[#B8F56D]">
                  {formatCode(data.session.joinCode)}
                </p>
              </div>
            </div>
          </section>
          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-950">
                Share options
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Use the QR code in slides, handouts, messages, or signage.
              </p>
              <div className="mt-4 space-y-2">
                <a
                  href={`${qrPath}?format=png&download=1`}
                  download
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" /> Download QR code · PNG
                </a>
                <a
                  href={`${qrPath}?format=svg&download=1`}
                  download
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" /> Download QR code · SVG
                </a>
                <ShareQrButton
                  qrUrl={`${qrPath}?format=png`}
                  joinUrl={joinUrl}
                  title={data.session.title}
                />
                <CopyButton
                  label="Copy direct join link"
                  value={joinUrl}
                  icon={Link2}
                />
                <CopyButton
                  label="Copy six-digit code"
                  value={data.session.joinCode}
                  icon={Clipboard}
                />
                <a
                  href={joinUrl}
                  target="_blank"
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" /> Preview learner view
                </a>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-950">Join policy</h3>
              <dl className="mt-4 space-y-3 text-xs">
                <ShareRow
                  label="Access"
                  value={
                    data.session.access === "open"
                      ? "Anyone with link"
                      : data.session.access === "invited"
                        ? "Invited emails"
                        : "Enrolled learners"
                  }
                />
                <ShareRow
                  label="Pace"
                  value={
                    data.session.pace === "facilitator"
                      ? "You control it"
                      : "Learners control it"
                  }
                />
                <ShareRow
                  label="Late join"
                  value={
                    data.session.settings.allowLateJoin
                      ? "Allowed"
                      : "Locked after start"
                  }
                />
                <ShareRow
                  label="Learner copilot"
                  value={
                    data.session.settings.learnerCopilot.enabled
                      ? "Available"
                      : "Hidden"
                  }
                />
              </dl>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-slate-400";

function Tab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Radio;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex min-w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold",
        active
          ? "bg-slate-950 text-white"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
      {label}
      {children}
    </label>
  );
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-slate-950" : "bg-slate-200",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
      {label}
    </label>
  );
}

function CopilotPermission({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex gap-3 rounded-xl border border-slate-200 p-4",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:border-slate-300",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-slate-950"
      />
      <span>
        <span className="block text-xs font-bold text-slate-800">{title}</span>
        <span className="mt-1 block text-[11px] leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function AddMenu({ onAdd }: { onAdd: (type: LiveActivityType) => void }) {
  return (
    <div className="mb-3 grid gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2">
      {activityChoices.map((choice) => (
        <button
          key={choice.type}
          onClick={() => onAdd(choice.type)}
          className="rounded-lg px-3 py-2 text-left hover:bg-white"
        >
          <span className="block text-xs font-bold text-slate-800">
            {choice.label}
          </span>
          <span className="block text-[10px] text-slate-400">
            {choice.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

function ActivityEditor({
  activity,
  materials,
  labWorkspaces,
  index,
  onChange,
  onMove,
  onRemove,
}: {
  activity: LiveActivity;
  materials: CourseMaterialRecord[];
  labWorkspaces: LabWorkspaceRecord[];
  index: number;
  onChange: (patch: Partial<LiveActivity>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  function updateOption(
    id: string,
    patch: Partial<LiveActivity["options"][number]>,
  ) {
    onChange({
      options: activity.options.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    });
  }
  function addOption() {
    onChange({
      options: [
        ...activity.options,
        {
          id: crypto.randomUUID(),
          label: `Option ${activity.options.length + 1}`,
          isCorrect: false,
        },
      ],
    });
  }
  const selectedLabWorkspace = labWorkspaces.find(
    (workspace) => workspace.id === activity.labWorkspaceId,
  );
  const learnerLabFiles = (selectedLabWorkspace?.files || []).filter(
    (file) => file.audience === "learner",
  );
  const labFolders = labWorkspaceFolderPaths(learnerLabFiles);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Activity {index + 1} · {activityLabel(activity.type)}
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">
            Design the learning moment
          </h3>
        </div>
        <div className="flex gap-1">
          <IconButton
            label="Move up"
            onClick={() => onMove(-1)}
            icon={ArrowUp}
          />
          <IconButton
            label="Move down"
            onClick={() => onMove(1)}
            icon={ArrowDown}
          />
          <IconButton label="Remove" onClick={onRemove} icon={Trash2} danger />
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Activity type">
          <select
            value={activity.type}
            onChange={(event) =>
              onChange({ type: event.target.value as LiveActivityType })
            }
            className={inputClass}
          >
            {activityChoices.map((choice) => (
              <option key={choice.type} value={choice.type}>
                {choice.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estimated time">
          <input
            type="number"
            min={1}
            value={activity.estimatedMinutes || ""}
            onChange={(event) =>
              onChange({
                estimatedMinutes: Number(event.target.value) || undefined,
              })
            }
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Title">
        <input
          value={activity.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Prompt or key idea">
        <textarea
          rows={3}
          value={activity.prompt || ""}
          onChange={(event) => onChange({ prompt: event.target.value })}
          className={`${inputClass} resize-y`}
        />
      </Field>
      <Field label="Learner instructions">
        <textarea
          rows={4}
          value={activity.instructions || ""}
          onChange={(event) => onChange({ instructions: event.target.value })}
          className={`${inputClass} resize-y`}
        />
      </Field>
      {activity.type === "task" || activity.type === "reflection" ? (
        <Field label="Success criteria">
          <textarea
            rows={2}
            value={activity.successCriteria || ""}
            onChange={(event) =>
              onChange({ successCriteria: event.target.value })
            }
            className={`${inputClass} resize-y`}
          />
        </Field>
      ) : null}
      <Field label="Private facilitator notes">
        <textarea
          rows={2}
          value={activity.facilitatorNotes || ""}
          onChange={(event) =>
            onChange({ facilitatorNotes: event.target.value })
          }
          className={`${inputClass} resize-y`}
        />
      </Field>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Course material">
          <select
            value={activity.materialId || ""}
            onChange={(event) =>
              onChange({ materialId: event.target.value || undefined })
            }
            className={inputClass}
          >
            <option value="">No attached material</option>
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lab workspace">
          <select
            value={activity.labWorkspaceId || ""}
            onChange={(event) =>
              onChange({
                labWorkspaceId: event.target.value || undefined,
                labEntryPath: undefined,
              })
            }
            className={inputClass}
          >
            <option value="">No attached lab</option>
            {labWorkspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.title}
              </option>
            ))}
          </select>
        </Field>
        {selectedLabWorkspace ? (
          <Field label="Open learners at">
            <select
              value={activity.labEntryPath || ""}
              onChange={(event) =>
                onChange({ labEntryPath: event.target.value || undefined })
              }
              className={inputClass}
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
            </select>
            <span className="mt-1.5 block text-[11px] leading-5 text-slate-400">
              Learners land here when this activity is presented.
            </span>
          </Field>
        ) : null}
        <Field label="External resource link">
          <input
            type="url"
            value={activity.resourceUrl || ""}
            onChange={(event) => onChange({ resourceUrl: event.target.value })}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>
        {activity.type === "quiz" ? (
          <Field label="Points">
            <input
              type="number"
              min={0}
              value={activity.points}
              onChange={(event) =>
                onChange({ points: Number(event.target.value) || 0 })
              }
              className={inputClass}
            />
          </Field>
        ) : null}
      </div>
      {["poll", "quiz", "setup_check"].includes(activity.type) ? (
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Response options
            </p>
            <button
              onClick={addOption}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add option
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {activity.options.map((option) => (
              <div key={option.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    activity.type === "quiz" &&
                    updateOption(option.id, { isCorrect: !option.isCorrect })
                  }
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    option.isCorrect
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-300",
                  )}
                  title={
                    activity.type === "quiz" ? "Mark correct answer" : undefined
                  }
                >
                  {activity.type === "quiz" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </button>
                <input
                  value={option.label}
                  onChange={(event) =>
                    updateOption(option.id, { label: event.target.value })
                  }
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <button
                  onClick={() =>
                    onChange({
                      options: activity.options.filter(
                        (item) => item.id !== option.id,
                      ),
                    })
                  }
                  className="p-2 text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <Toggle
              checked={activity.randomizeOptions}
              onChange={(value) => onChange({ randomizeOptions: value })}
              label="Shuffle per learner"
            />
            <Toggle
              checked={activity.showResults}
              onChange={(value) => onChange({ showResults: value })}
              label="Reveal results after close"
            />
          </div>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-4">
        <Toggle
          checked={activity.required}
          onChange={(value) => onChange({ required: value })}
          label="Required activity"
        />
      </div>
    </section>
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
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">Live responses</p>
          <p className="mt-1 text-xs text-slate-400">
            {responses} of {participants} · {rate}% responded
          </p>
        </div>
        <BarChart3 className="h-5 w-5 text-slate-300" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#71E0E7] transition-all"
          style={{ width: `${rate}%` }}
        />
      </div>
      {activity.options.length ? (
        <div className="mt-6 space-y-3">
          {activity.options.map((option) => {
            const count =
              results?.options?.find((item) => item.id === option.id)?.count ||
              0;
            const width = responses ? Math.round((count / responses) * 100) : 0;
            return (
              <div key={option.id}>
                <div className="flex justify-between gap-3 text-xs">
                  <span className="font-medium text-slate-700">
                    {option.label}
                  </span>
                  <span className="text-slate-400">
                    {count} · {width}%
                  </span>
                </div>
                <div className="mt-1.5 h-7 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-md transition-all",
                      option.isCorrect ? "bg-[#B8F56D]" : "bg-slate-300",
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : results?.textResponses?.length ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {results.textResponses.slice(-20).map((response) => (
            <div key={response.id} className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm leading-6 text-slate-700">
                {response.value}
              </p>
              {response.participantName ? (
                <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">
                  {response.participantName}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          Responses will appear here.
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  icon: Icon,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon: typeof ArrowUp;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50",
        danger && "hover:border-red-200 hover:bg-red-50 hover:text-red-600",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
function SessionStatus({ status }: { status: LiveSessionRecord["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest",
        status === "live"
          ? "bg-red-50 text-red-700"
          : status === "lobby"
            ? "bg-cyan-50 text-cyan-700"
            : status === "ended"
              ? "bg-slate-100 text-slate-500"
              : "bg-amber-50 text-amber-700",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "live" ? "animate-pulse bg-red-500" : "bg-current",
        )}
      />
      {status}
    </span>
  );
}
function CopyButton({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Link2;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{copied ? "Copied" : label}</span>
      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : null}
    </button>
  );
}
function ShareQrButton({
  qrUrl,
  joinUrl,
  title,
}: {
  qrUrl: string;
  joinUrl: string;
  title: string;
}) {
  const [status, setStatus] = useState<"idle" | "sharing" | "copied">("idle");
  async function share() {
    if (status === "sharing") return;
    setStatus("sharing");
    try {
      if (navigator.share) {
        const response = await fetch(qrUrl);
        const blob = response.ok ? await response.blob() : null;
        const file = blob
          ? new File([blob], "live-session-qr.png", { type: "image/png" })
          : null;
        if (file && navigator.canShare?.({ files: [file] }))
          await navigator.share({
            title,
            text: "Scan this QR code to join the live session.",
            files: [file],
          });
        else
          await navigator.share({
            title,
            text: "Join the live session",
            url: joinUrl,
          });
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
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
    >
      <Share2 className="h-4 w-4" />
      <span className="flex-1">
        {status === "sharing"
          ? "Preparing QR code…"
          : status === "copied"
            ? "Join link copied"
            : "Share QR code"}
      </span>
      {status === "sharing" ? (
        <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" />
      ) : status === "copied" ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : null}
    </button>
  );
}
function ShareRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-bold text-slate-700">{value}</dd>
    </div>
  );
}
function activityLabel(type: LiveActivityType) {
  return activityChoices.find((choice) => choice.type === type)?.label || type;
}
function labPathLabel(path: string) {
  return path
    .split("/")
    .map((segment) =>
      segment
        .replace(/\.[^.]+$/, "")
        .replace(/^\d+_/, "")
        .replaceAll("_", " "),
    )
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
