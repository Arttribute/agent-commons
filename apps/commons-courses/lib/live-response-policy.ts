import type { LiveActivity } from "@/types/live-session";

export function canReviseLiveResponse(activity: LiveActivity) {
  return activity.type === "poll" && activity.status === "open";
}

export function sameLiveResponseValue(
  current: string | string[] | undefined,
  saved: string | string[],
) {
  const normalize = (value: string | string[] | undefined) =>
    Array.isArray(value) ? [...value].map(String).sort() : String(value || "");
  return (
    JSON.stringify(normalize(current)) === JSON.stringify(normalize(saved))
  );
}
