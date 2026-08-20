import type {
  LiveActivity,
  LiveActivityStatus,
  LiveSessionPace,
  LiveSessionPart,
} from "@/types/live-session";

type PartAwareSession = {
  pace: LiveSessionPace;
  parts?: LiveSessionPart[];
};

export function partForActivity(
  session: PartAwareSession,
  activityId?: string,
) {
  if (!activityId) return undefined;
  return session.parts?.find((part) => part.activityIds.includes(activityId));
}

export function effectiveActivityPace(
  session: PartAwareSession,
  activityId?: string,
) {
  return partForActivity(session, activityId)?.pace || session.pace;
}

export function isActivityPartOpen(
  session: PartAwareSession,
  activityId?: string,
) {
  const part = partForActivity(session, activityId);
  return !part || part.status === "open";
}

export function activityStatusesForParts({
  activities,
  parts,
  currentActivityId,
}: {
  activities: LiveActivity[];
  parts: LiveSessionPart[];
  currentActivityId?: string;
}) {
  const statuses: Record<string, LiveActivityStatus> = {};
  for (const activity of activities) {
    const part = parts.find((candidate) =>
      candidate.activityIds.includes(activity.id),
    );
    if (!part || part.status === "closed") {
      statuses[activity.id] = "draft";
    } else {
      statuses[activity.id] =
        part.pace === "learner" || activity.id === currentActivityId
          ? "open"
          : "closed";
    }
  }
  return statuses;
}

export function firstActivityIdForPart(
  activities: LiveActivity[],
  part?: LiveSessionPart,
) {
  return part?.activityIds.find((id) =>
    activities.some((activity) => activity.id === id),
  );
}
