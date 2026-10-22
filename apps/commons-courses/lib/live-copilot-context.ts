import type {
  LiveActivity,
  LiveSessionPart,
  LiveSessionPace,
} from "../types/live-session.ts";
import { resolveLearnerActivitySelection } from "./live-learner-selection.ts";

export type CopilotLiveSession = {
  _id: unknown;
  courseId: unknown;
  title: string;
  status: string;
  pace: LiveSessionPace;
  currentActivityId?: string;
  currentPartId?: string;
  parts?: LiveSessionPart[];
  activities: LiveActivity[];
};

export function visibleCopilotActivity(
  session: CopilotLiveSession,
  requestedId?: string,
  responses: Record<string, any> = {},
) {
  if (session.status !== "live" && session.status !== "ended") return null;
  const parts = session.parts || [];
  const requestedPart = parts.find(
    (part) =>
      part.status === "open" && part.activityIds.includes(requestedId || ""),
  );
  const presentedPart = parts.find(
    (part) =>
      part.status === "open" &&
      part.activityIds.includes(session.currentActivityId || ""),
  );
  const part =
    requestedPart ||
    presentedPart ||
    parts.find((candidate) => candidate.status === "open");
  if (parts.length && !part) return null;
  const activities = session.activities.filter(
    (activity) =>
      (!part || part.activityIds.includes(activity.id)) &&
      activity.status !== "draft",
  );
  const id = resolveLearnerActivitySelection({
    activities,
    currentActivityId: session.currentActivityId,
    lastPresentedActivityId: session.currentActivityId,
    selectedActivityId: requestedId,
    pace: part?.pace || session.pace,
    responses,
  });
  const activity = activities.find((candidate) => candidate.id === id);
  return activity ? { activity, part } : null;
}

export function publicActivityContext(activity: LiveActivity) {
  return {
    id: activity.id,
    title: activity.title,
    type: activity.type,
    status: activity.status,
    prompt: activity.prompt,
    instructions: activity.instructions,
    successCriteria: activity.successCriteria,
    required: activity.required,
    estimatedMinutes: activity.estimatedMinutes,
    worksheetFields: activity.worksheetFields,
    scoreCriteria: activity.scoreCriteria,
    options: activity.options.map(({ id, label }) => ({ id, label })),
    labEntryPath: activity.labEntryPath,
    sourceActivityId: activity.sourceActivityId,
  };
}

export function boundedLearnerValue(value: unknown, limit = 12000) {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.slice(0, limit);
}
