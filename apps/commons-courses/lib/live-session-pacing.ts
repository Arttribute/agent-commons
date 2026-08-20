import type {
  LiveActivity,
  LiveActivityStatus,
  LiveSessionPace,
} from "@/types/live-session";

export function activityStatusesForLivePace({
  activities,
  currentActivityId,
  pace,
}: {
  activities: LiveActivity[];
  currentActivityId?: string;
  pace: LiveSessionPace;
}) {
  const current =
    activities.find((activity) => activity.id === currentActivityId) ||
    activities[0];
  const statuses: Record<string, LiveActivityStatus> = {};
  for (const activity of activities) {
    statuses[activity.id] =
      pace === "learner" || activity.id === current?.id ? "open" : "closed";
  }
  return { currentActivityId: current?.id, statuses };
}
