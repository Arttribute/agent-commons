import type { LiveActivity, LiveActivityOption } from "@/types/live-session";

type DocumentLike<T> = T & { toObject?: () => T };

function plain<T>(value: DocumentLike<T>): T {
  return typeof value.toObject === "function" ? value.toObject() : value;
}

export function learnerSafeActivities(activities: LiveActivity[]) {
  return activities.map((source) => {
    const activity = plain(source as DocumentLike<LiveActivity>);
    return {
      ...activity,
      facilitatorNotes: undefined,
      options: activity.options.map((sourceOption) => {
        const option = plain(sourceOption as DocumentLike<LiveActivityOption>);
        return {
          id: option.id,
          label: option.label,
          isCorrect:
            activity.status === "closed" && activity.showResults
              ? Boolean(option.isCorrect)
              : undefined,
        };
      }),
    } satisfies LiveActivity;
  });
}
