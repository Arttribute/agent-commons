import { randomInt, randomUUID } from "crypto";
import type {
  LiveActivity,
  LiveActivityOption,
  LiveActivityType,
  LiveSessionAccess,
  LiveSessionPace,
} from "@/types/live-session";
import {
  defaultLiveLearnerCopilotPolicy,
  normalizeLiveLearnerCopilotPolicy,
} from "@/lib/live-copilot-policy";

const activityTypes: LiveActivityType[] = [
  "content",
  "setup_check",
  "poll",
  "quiz",
  "prioritization",
  "reflection",
  "task",
  "break",
];

export function createJoinCode() {
  return String(randomInt(100_000, 1_000_000));
}

export function createActivity(
  input: Partial<LiveActivity> & Pick<LiveActivity, "title" | "type">,
): LiveActivity {
  return {
    id: input.id?.trim() || randomUUID(),
    type: activityTypes.includes(input.type) ? input.type : "content",
    title: clean(input.title) || "Untitled activity",
    prompt: clean(input.prompt),
    instructions: clean(input.instructions),
    successCriteria: clean(input.successCriteria),
    facilitatorNotes: clean(input.facilitatorNotes),
    resourceUrl: cleanUrl(input.resourceUrl),
    materialId: clean(input.materialId),
    materialStartSlide: clampNumber(input.materialStartSlide, 1, 500),
    labWorkspaceId: clean(input.labWorkspaceId),
    labEntryPath: cleanLabEntryPath(input.labEntryPath),
    estimatedMinutes: clampNumber(input.estimatedMinutes, 1, 480),
    status:
      input.status === "open" || input.status === "closed"
        ? input.status
        : "draft",
    required: Boolean(input.required),
    randomizeOptions: Boolean(input.randomizeOptions),
    showResults: Boolean(input.showResults),
    allowOther: Boolean(input.allowOther),
    responseStyle: input.responseStyle === "scale" ? "scale" : "cards",
    entryLabel: clean(input.entryLabel),
    selectionPrompt: clean(input.selectionPrompt),
    minItems: clampNumber(input.minItems, 1, 50),
    maxSelections: clampNumber(input.maxSelections, 1, 10),
    points: clampNumber(input.points, 0, 10_000) || 0,
    options: normalizeOptions(input.options),
  };
}

function cleanLabEntryPath(value: unknown) {
  const normalized = clean(value)?.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.length > 500 ||
    normalized
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return undefined;
  }
  return normalized;
}

export function normalizeActivities(input: unknown): LiveActivity[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 120)
    .map((value) => {
      if (!value || typeof value !== "object") return null;
      const record = value as Partial<LiveActivity>;
      const type = activityTypes.includes(record.type as LiveActivityType)
        ? (record.type as LiveActivityType)
        : "content";
      return createActivity({
        ...record,
        type,
        title: clean(record.title) || "Untitled activity",
      });
    })
    .filter((activity): activity is LiveActivity => Boolean(activity));
}

export function normalizeSessionCreate(input: unknown) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const title = clean(body.title) || "New live session";
  const pace: LiveSessionPace =
    body.pace === "learner" ? "learner" : "facilitator";
  const access: LiveSessionAccess =
    body.access === "open" || body.access === "invited"
      ? body.access
      : "enrolled";
  const template = body.template === "blank" ? "blank" : "facilitated_workshop";
  return {
    title,
    description: clean(body.description),
    pace,
    access,
    invitedEmails: normalizeEmails(body.invitedEmails),
    scheduledStart: normalizeDate(body.scheduledStart),
    activities: template === "blank" ? [] : createFacilitatedWorkshopTemplate(),
    settings: {
      allowLateJoin: true,
      showParticipantNames: false,
      showLeaderboard: false,
      learnerCopilot: defaultLiveLearnerCopilotPolicy,
    },
  };
}

export function normalizeSessionPatch(input: unknown) {
  const body =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const patch: Record<string, unknown> = {};
  if ("title" in body)
    patch.title = clean(body.title) || "Untitled live session";
  if ("description" in body) patch.description = clean(body.description);
  if (body.pace === "facilitator" || body.pace === "learner")
    patch.pace = body.pace;
  if (
    body.access === "enrolled" ||
    body.access === "invited" ||
    body.access === "open"
  ) {
    patch.access = body.access;
  }
  if ("invitedEmails" in body)
    patch.invitedEmails = normalizeEmails(body.invitedEmails);
  if ("scheduledStart" in body)
    patch.scheduledStart = normalizeDate(body.scheduledStart);
  if ("activities" in body)
    patch.activities = normalizeActivities(body.activities);
  if (body.settings && typeof body.settings === "object") {
    const settings = body.settings as Record<string, unknown>;
    patch.settings = {
      allowLateJoin: settings.allowLateJoin !== false,
      showParticipantNames: Boolean(settings.showParticipantNames),
      showLeaderboard: Boolean(settings.showLeaderboard),
      learnerCopilot: normalizeLiveLearnerCopilotPolicy(
        settings.learnerCopilot && typeof settings.learnerCopilot === "object"
          ? settings.learnerCopilot
          : undefined,
      ),
    };
  }
  return patch;
}

export function createFacilitatedWorkshopTemplate(): LiveActivity[] {
  return [
    createActivity({
      type: "setup_check",
      title: "Room and setup check",
      prompt: "Are you ready to participate?",
      instructions:
        "Confirm the essential account, device, and tool setup before the session moves on.",
      facilitatorNotes:
        "Keep this open in the lobby. Resolve blockers before starting the first teaching block.",
      options: ["Ready", "I need help"].map(option),
      showResults: true,
      required: true,
      estimatedMinutes: 5,
    }),
    createActivity({
      type: "poll",
      title: "Opening diagnostic",
      prompt: "How confident are you with today’s topic?",
      instructions: "Choose the response that best describes you right now.",
      options: ["1 · New to this", "2", "3", "4", "5 · Very confident"].map(
        option,
      ),
      showResults: true,
      responseStyle: "scale",
      required: true,
      estimatedMinutes: 3,
    }),
    createActivity({
      type: "content",
      title: "Follow along",
      prompt: "Key ideas and examples for this teaching block.",
      instructions:
        "Use this page as the shared workbook. Add the material learners need while you teach.",
      estimatedMinutes: 15,
    }),
    createActivity({
      type: "task",
      title: "Guided practice",
      prompt: "Try the demonstrated move on the provided example.",
      instructions:
        "Work individually or in pairs, then submit a short note or link to your artifact.",
      successCriteria:
        "You can show the completed artifact and explain one decision you made.",
      facilitatorNotes:
        "Give a time check halfway through and invite one pair to share.",
      required: true,
      estimatedMinutes: 20,
    }),
    createActivity({
      type: "quiz",
      title: "Retrieval check",
      prompt: "Which option best applies the idea we just practised?",
      instructions:
        "Answer on your own first. We will discuss the reasoning together.",
      options: [
        { id: randomUUID(), label: "Add the correct answer", isCorrect: true },
        {
          id: randomUUID(),
          label: "Add a plausible distractor",
          isCorrect: false,
        },
        {
          id: randomUUID(),
          label: "Add another plausible distractor",
          isCorrect: false,
        },
      ],
      randomizeOptions: true,
      showResults: true,
      points: 1,
      required: true,
      estimatedMinutes: 3,
    }),
    createActivity({
      type: "break",
      title: "Break",
      prompt: "Stand up, recharge, and return ready for the next block.",
      facilitatorNotes:
        "Close this activity when the room is ready to continue.",
      estimatedMinutes: 15,
    }),
    createActivity({
      type: "reflection",
      title: "Exit reflection",
      prompt: "What will you apply first, and what still feels unclear?",
      instructions:
        "Write one concrete next step and one question for the facilitator.",
      showResults: false,
      required: true,
      estimatedMinutes: 5,
    }),
  ];
}

function option(label: string): LiveActivityOption {
  return { id: randomUUID(), label, isCorrect: false };
}

function normalizeOptions(input: unknown): LiveActivityOption[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 20)
    .map((value) => {
      if (typeof value === "string") return option(value);
      if (!value || typeof value !== "object") return null;
      const record = value as Partial<LiveActivityOption>;
      const label = clean(record.label);
      if (!label) return null;
      return {
        id: clean(record.id) || randomUUID(),
        label,
        isCorrect: Boolean(record.isCorrect),
      };
    })
    .filter((value): value is LiveActivityOption => Boolean(value));
}

function normalizeEmails(input: unknown) {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\n,;]/)
      : [];
  return Array.from(
    new Set(
      values
        .map((value) => clean(value)?.toLowerCase())
        .filter((value): value is string =>
          Boolean(value && value.includes("@")),
        ),
    ),
  ).slice(0, 2_000);
}

function normalizeDate(input: unknown) {
  if (!input) return undefined;
  const date = new Date(String(input));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function clean(input: unknown) {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  return value ? value.slice(0, 20_000) : undefined;
}

function cleanUrl(input: unknown) {
  const value = clean(input);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function clampNumber(input: unknown, min: number, max: number) {
  if (typeof input !== "number" || !Number.isFinite(input)) return undefined;
  return Math.min(max, Math.max(min, Math.round(input)));
}
