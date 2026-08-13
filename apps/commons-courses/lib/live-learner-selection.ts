import type {
  LiveActivity,
  LiveResponseRecord,
  LiveSessionPace,
} from "@/types/live-session";

type SelectionInput = {
  activities: LiveActivity[];
  currentActivityId?: string;
  lastPresentedActivityId?: string;
  pace: LiveSessionPace;
  responses: Record<string, LiveResponseRecord>;
  selectedActivityId?: string;
};

export function resolveLearnerActivitySelection({
  activities,
  currentActivityId,
  lastPresentedActivityId,
  pace,
  responses,
  selectedActivityId,
}: SelectionInput) {
  const current = activities.find(
    (activity) =>
      activity.id === currentActivityId && activity.status !== "draft",
  );
  const firstOpen = activities.find((activity) => activity.status === "open");

  if (pace === "facilitator") return current?.id || firstOpen?.id || "";

  // A facilitator presenting something is an intentional live-room action,
  // even in learner-paced rooms. Follow it once, then let the learner browse.
  if (current && current.id !== lastPresentedActivityId) return current.id;

  const selected = activities.find(
    (activity) => activity.id === selectedActivityId,
  );
  if (
    selected &&
    (selected.status === "open" ||
      selected.id === current?.id ||
      Boolean(responses[selected.id]))
  ) {
    return selected.id;
  }

  return (
    current?.id ||
    firstOpen?.id ||
    activities.find((activity) => Boolean(responses[activity.id]))?.id ||
    ""
  );
}

export function learnerAvailableActivities(
  activities: LiveActivity[],
  currentActivityId: string | undefined,
  responses: Record<string, LiveResponseRecord>,
) {
  return activities.filter(
    (activity) =>
      activity.status === "open" ||
      activity.id === currentActivityId ||
      Boolean(responses[activity.id]),
  );
}
