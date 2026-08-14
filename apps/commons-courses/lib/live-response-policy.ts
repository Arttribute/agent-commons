import type { LiveActivity } from "@/types/live-session";

export const OTHER_RESPONSE_PREFIX = "__other__:";

export function encodeOtherResponse(value: string) {
  return `${OTHER_RESPONSE_PREFIX}${value}`;
}

export function decodeOtherResponse(value: unknown) {
  if (typeof value !== "string" || !value.startsWith(OTHER_RESPONSE_PREFIX))
    return undefined;
  return value.slice(OTHER_RESPONSE_PREFIX.length);
}

export function isValidLiveResponse(
  activity: LiveActivity,
  value: string | string[],
) {
  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  if (!values.length || values.some((item) => !item.trim())) return false;
  if (!activity.options.length) return values.every((item) => item.length <= 10_000);
  const allowed = new Set(activity.options.map((option) => option.id));
  return values.every((item) => {
    const other = decodeOtherResponse(item);
    if (other !== undefined)
      return Boolean(activity.allowOther && other.trim() && other.length <= 500);
    return allowed.has(item);
  });
}

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
