import type {
  LiveActivity,
  LiveCardCollectionResponse,
  LiveLinkedScorecardResponse,
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
  sourceValue?: unknown,
) {
  if (activity.type === "prioritization") {
    return normalizePrioritizationResponse(activity, value) !== undefined;
  }
  if (activity.type === "worksheet") {
    return normalizeWorksheetResponse(activity, value) !== undefined;
  }
  if (activity.type === "card_collection") {
    return normalizeCardCollectionResponse(activity, value) !== undefined;
  }
  if (activity.type === "linked_scorecard") {
    return (
      normalizeLinkedScorecardResponse(activity, value, sourceValue) !==
      undefined
    );
  }
  if (!Array.isArray(value) && typeof value !== "string") return false;
  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  if (!values.length || values.some((item) => !item.trim())) return false;
  if (!activity.options.length)
    return values.every((item) => item.length <= 10_000);
  const allowed = new Set(activity.options.map((option) => option.id));
  return values.every((item) => {
    const other = decodeOtherResponse(item);
    if (other !== undefined)
      return Boolean(
        activity.allowOther && other.trim() && other.length <= 500,
      );
    return allowed.has(item);
  });
}

export function canReviseLiveResponse(activity: LiveActivity) {
  return (
    (activity.type === "poll" ||
      activity.type === "prioritization" ||
      activity.type === "worksheet" ||
      activity.type === "card_collection" ||
      activity.type === "linked_scorecard") &&
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
    if (isCardCollectionResponse(value)) {
      return {
        finalized: value.finalized,
        items: value.items.map((item) => ({
          id: item.id,
          values: Object.fromEntries(
            Object.entries(item.values).sort(([a], [b]) => a.localeCompare(b)),
          ),
        })),
      };
    }
    if (isLinkedScorecardResponse(value)) {
      return {
        finalized: value.finalized,
        selectedItemId: value.selectedItemId,
        selectionReason: value.selectionReason,
        items: value.items.map((item) => ({
          sourceItemId: item.sourceItemId,
          scores: Object.fromEntries(
            Object.entries(item.scores).sort(([a], [b]) => a.localeCompare(b)),
          ),
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

export function isCardCollectionResponse(
  value: unknown,
): value is LiveCardCollectionResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Array.isArray((value as { items?: unknown }).items) &&
      !(value as { items: unknown[] }).items.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          !(item as { values?: unknown }).values,
      ),
  );
}

export function normalizeCardCollectionResponse(
  activity: LiveActivity,
  value: unknown,
): LiveCardCollectionResponse | undefined {
  if (!isCardCollectionResponse(value) || !activity.worksheetFields?.length)
    return undefined;
  const seen = new Set<string>();
  const finalized = Boolean(value.finalized);
  if (value.items.length > 50) return undefined;
  const items: LiveCardCollectionResponse["items"] = [];
  for (const [index, item] of value.items.entries()) {
    const sourceId = typeof item.id === "string" ? item.id.trim() : "";
    const id = /^[a-zA-Z0-9_-]{1,80}$/.test(sourceId)
      ? sourceId
      : `card-${index + 1}`;
    if (seen.has(id)) return undefined;
    seen.add(id);
    const normalized = normalizeWorksheetResponse(activity, {
      values: item.values,
      finalized,
    });
    if (!normalized) return undefined;
    items.push({ id, values: normalized.values });
  }
  if (!items.length) return undefined;
  if (finalized && items.length < (activity.minItems || 1)) return undefined;
  return { items, finalized };
}

export function isLinkedScorecardResponse(
  value: unknown,
): value is LiveLinkedScorecardResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Array.isArray((value as { items?: unknown }).items) &&
      (value as { items: unknown[] }).items.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { sourceItemId?: unknown }).sourceItemId ===
            "string" &&
          (item as { scores?: unknown }).scores &&
          typeof (item as { scores?: unknown }).scores === "object" &&
          !Array.isArray((item as { scores?: unknown }).scores),
      ),
  );
}

export function normalizeLinkedScorecardResponse(
  activity: LiveActivity,
  value: unknown,
  sourceValue: unknown,
): LiveLinkedScorecardResponse | undefined {
  if (
    !isLinkedScorecardResponse(value) ||
    !activity.sourceActivityId ||
    !activity.scoreCriteria?.length ||
    !isCardCollectionResponse(sourceValue)
  )
    return undefined;
  const sourceIds = new Set(sourceValue.items.map((item) => item.id));
  const criterionById = new Map(
    activity.scoreCriteria.map((criterion) => [criterion.id, criterion]),
  );
  const seen = new Set<string>();
  const items: LiveLinkedScorecardResponse["items"] = [];
  for (const item of value.items) {
    if (
      !item ||
      typeof item !== "object" ||
      !sourceIds.has(item.sourceItemId) ||
      seen.has(item.sourceItemId)
    )
      return undefined;
    seen.add(item.sourceItemId);
    const scores: Record<string, number> = {};
    for (const [criterionId, rawScore] of Object.entries(item.scores || {})) {
      const criterion = criterionById.get(criterionId);
      const score = Number(rawScore);
      if (
        !criterion ||
        !Number.isInteger(score) ||
        score < criterion.min ||
        score > criterion.max
      )
        return undefined;
      scores[criterionId] = score;
    }
    items.push({ sourceItemId: item.sourceItemId, scores });
  }
  if (!items.length) return undefined;
  const selectedItemId =
    typeof value.selectedItemId === "string" &&
    sourceIds.has(value.selectedItemId)
      ? value.selectedItemId
      : undefined;
  const selectionReason =
    typeof value.selectionReason === "string" && value.selectionReason.trim()
      ? value.selectionReason.trim().slice(0, 10_000)
      : undefined;
  const finalized = Boolean(value.finalized);
  if (finalized) {
    const complete = sourceValue.items.every((sourceItem) => {
      const scored = items.find((item) => item.sourceItemId === sourceItem.id);
      return activity.scoreCriteria?.every(
        (criterion) => scored?.scores[criterion.id] !== undefined,
      );
    });
    if (!selectedItemId || !selectionReason || !complete) return undefined;
  }
  return { items, selectedItemId, selectionReason, finalized };
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
      Array.isArray((value as { items?: unknown }).items) &&
      (value as { items: unknown[] }).items.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { text?: unknown }).text === "string",
      ),
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
