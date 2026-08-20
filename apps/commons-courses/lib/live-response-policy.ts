import type {
  LiveActivity,
  LivePrioritizationResponse,
  LiveResponseValue,
  LiveWorksheetResponse,
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
  if (activity.type === "worksheet") {
    return normalizeWorksheetResponse(activity, value) !== undefined;
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
    (activity.type === "poll" ||
      activity.type === "prioritization" ||
      activity.type === "worksheet") &&
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
    if (isWorksheetResponse(value)) {
      return {
        finalized: value.finalized,
        values: Object.fromEntries(
          Object.entries(value.values).sort(([a], [b]) => a.localeCompare(b)),
        ),
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

export function isWorksheetResponse(
  value: unknown,
): value is LiveWorksheetResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { values?: unknown }).values &&
      typeof (value as { values?: unknown }).values === "object" &&
      !Array.isArray((value as { values?: unknown }).values),
  );
}

export function normalizeWorksheetResponse(
  activity: LiveActivity,
  value: unknown,
): LiveWorksheetResponse | undefined {
  if (!isWorksheetResponse(value) || !activity.worksheetFields?.length)
    return undefined;
  const values: Record<string, string | number> = {};
  for (const field of activity.worksheetFields) {
    const source = value.values[field.id];
    if (source === undefined || source === null || source === "") continue;
    if (field.type === "scale") {
      const number = Number(source);
      const min = field.min ?? 1;
      const max = field.max ?? 5;
      if (!Number.isInteger(number) || number < min || number > max)
        return undefined;
      values[field.id] = number;
      continue;
    }
    if (typeof source !== "string") return undefined;
    const cleaned = source.trim();
    const limit = field.type === "long_text" ? 10_000 : 500;
    if (!cleaned || cleaned.length > limit) return undefined;
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(cleaned))
      return undefined;
    values[field.id] = cleaned;
  }
  if (!Object.keys(values).length) return undefined;
  const finalized = Boolean(value.finalized);
  if (
    finalized &&
    activity.worksheetFields.some(
      (field) => field.required && values[field.id] === undefined,
    )
  ) {
    return undefined;
  }
  return { values, finalized };
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
