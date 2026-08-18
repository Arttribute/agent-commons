import type {
  LiveActivity,
  LivePrioritizationResponse,
  LiveResponseValue,
} from "@/types/live-session";

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
  value: unknown,
) {
  if (activity.type === "prioritization") {
    return normalizePrioritizationResponse(activity, value) !== undefined;
  }
  if (!Array.isArray(value) && typeof value !== "string") return false;
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
  return (
    (activity.type === "poll" || activity.type === "prioritization") &&
    activity.status === "open"
  );
}

export function sameLiveResponseValue(
  current: LiveResponseValue | undefined,
  saved: LiveResponseValue,
) {
  const normalize = (value: LiveResponseValue | undefined) => {
    if (isPrioritizationResponse(value)) {
      return {
        finalized: value.finalized,
        items: value.items.map((item) => ({
          id: item.id,
          text: item.text,
          selected: item.selected,
        })),
      };
    }
    return Array.isArray(value)
      ? [...value].map(String).sort()
      : String(value || "");
  };
  return (
    JSON.stringify(normalize(current)) === JSON.stringify(normalize(saved))
  );
}

export function isPrioritizationResponse(
  value: unknown,
): value is LivePrioritizationResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Array.isArray((value as { items?: unknown }).items),
  );
}

export function normalizePrioritizationResponse(
  activity: LiveActivity,
  value: unknown,
): LivePrioritizationResponse | undefined {
  if (!isPrioritizationResponse(value)) return undefined;
  const seen = new Set<string>();
  const items = value.items.slice(0, 50).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const source = item as { id?: unknown; text?: unknown; selected?: unknown };
    const text =
      typeof source.text === "string"
        ? source.text.replace(/\s+/g, " ").trim().slice(0, 280)
        : "";
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) return [];
    seen.add(key);
    const sourceId = typeof source.id === "string" ? source.id.trim() : "";
    const id = /^[a-zA-Z0-9_-]{1,80}$/.test(sourceId)
      ? sourceId
      : `item-${index + 1}`;
    return [{ id, text, selected: Boolean(source.selected) }];
  });
  if (!items.length) return undefined;
  const maxSelections = activity.maxSelections || 3;
  const selectedCount = items.filter((item) => item.selected).length;
  if (selectedCount > maxSelections) return undefined;
  const finalized = Boolean(value.finalized);
  if (
    finalized &&
    (items.length < (activity.minItems || 1) || selectedCount < 1)
  ) {
    return undefined;
  }
  return { items, finalized };
}
