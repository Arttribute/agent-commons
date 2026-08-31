export type CheckInContextSource =
  | "manual"
  | "outcome_contract"
  | "chosen_focus"
  | "commitment"
  | "reflection"
  | "not_captured";

export type TargetCheckInContext = {
  userId: unknown;
  context: string;
  source?: CheckInContextSource;
};

export type CheckInActivityLike = {
  id: string;
  title?: string;
  type?: string;
  itemTitleFieldId?: string;
  worksheetFields?: Array<{ id: string; label?: string }>;
};

export type CheckInResponseLike = {
  userId: unknown;
  activityId: string;
  value: unknown;
  submittedAt?: Date | string;
};

export function checkInContextForUser(
  contexts: TargetCheckInContext[] | undefined,
  userId: unknown,
) {
  const target = String(userId ?? "");
  return contexts?.find((item) => String(item.userId ?? "") === target);
}

export function buildLiveCheckInContext({
  activities,
  responses,
  userId,
}: {
  activities: CheckInActivityLike[];
  responses: CheckInResponseLike[];
  userId: unknown;
}): Omit<TargetCheckInContext, "userId"> | undefined {
  const target = String(userId ?? "");
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const learnerResponses = responses
    .filter((response) => String(response.userId ?? "") === target)
    .sort(
      (left, right) =>
        new Date(right.submittedAt || 0).getTime() -
        new Date(left.submittedAt || 0).getTime(),
    );

  const contract = learnerResponses.find((response) => {
    const activity = activityById.get(response.activityId);
    return /outcome.?contract/i.test(`${activity?.id || ""} ${activity?.title || ""}`);
  });
  const contractValues = worksheetValues(contract?.value);
  const outcome = matchingValue(contractValues, /outcome|goal|achiev|change/i);
  if (outcome) {
    const evidence = matchingValue(
      contractValues,
      /evidence|measure|success|proof|know.*work/i,
    );
    return {
      source: "outcome_contract",
      context: joinSections([
        "Your outcome contract",
        `Outcome: ${outcome}`,
        evidence ? `How you said you would know it worked: ${evidence}` : undefined,
      ]),
    };
  }

  const collections = learnerResponses.flatMap((response) => {
    const activity = activityById.get(response.activityId);
    const items = cardItems(response.value);
    return items.map((item) => ({ activity, item }));
  });
  const linkedChoice = learnerResponses
    .map((response) => linkedScorecard(response.value))
    .find((value) => value?.selectedItemId || value?.selectionReason);
  const chosenCard = linkedChoice?.selectedItemId
    ? collections.find(({ item }) => item.id === linkedChoice.selectedItemId)
    : collections.length === 1
      ? collections[0]
      : undefined;
  const taskName = chosenCard
    ? cardTitle(chosenCard.activity, chosenCard.item.values)
    : undefined;

  const commitmentResponse = learnerResponses.find((response) => {
    const activity = activityById.get(response.activityId);
    const values = worksheetValues(response.value);
    return (
      /commit|assignment|next step/i.test(
        `${activity?.id || ""} ${activity?.title || ""}`,
      ) && Boolean(matchingValue(values, /commit|recorded.task|next.step|plan/i))
    );
  });
  const commitmentValues = worksheetValues(commitmentResponse?.value);
  const commitment = matchingValue(
    commitmentValues,
    /commitment|next.step|plan|recorded.task/i,
  );
  const measure = matchingValue(
    commitmentValues,
    /evidence|measure|success|proof|score/i,
  );

  if (taskName || linkedChoice?.selectionReason || commitment) {
    return {
      source: taskName || linkedChoice?.selectionReason ? "chosen_focus" : "commitment",
      context: joinSections([
        "The focus you chose during the workshop",
        taskName ? `Task: ${taskName}` : undefined,
        linkedChoice?.selectionReason
          ? `Why you chose it: ${linkedChoice.selectionReason}`
          : undefined,
        commitment ? `Your commitment: ${commitment}` : undefined,
        measure ? `How you planned to measure it: ${measure}` : undefined,
      ]),
    };
  }

  const reflection = learnerResponses.find((response) => {
    const activity = activityById.get(response.activityId);
    return activity?.type === "reflection";
  });
  const reflectionText = scalarText(reflection?.value);
  return reflectionText
    ? {
        source: "reflection",
        context: joinSections([
          "What you said at the end of the workshop",
          reflectionText,
        ]),
      }
    : undefined;
}

function worksheetValues(value: unknown) {
  if (!isRecord(value) || !isRecord(value.values)) return {};
  return value.values;
}

function cardItems(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  return value.items.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !isRecord(item.values)) {
      return [];
    }
    return [{ id: item.id, values: item.values }];
  });
}

function linkedScorecard(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items)) return undefined;
  return {
    selectedItemId:
      typeof value.selectedItemId === "string" && value.selectedItemId.trim()
        ? value.selectedItemId
        : undefined,
    selectionReason:
      typeof value.selectionReason === "string" && value.selectionReason.trim()
        ? value.selectionReason.trim()
        : undefined,
  };
}

function cardTitle(activity: CheckInActivityLike | undefined, values: Record<string, unknown>) {
  const fieldId = activity?.itemTitleFieldId || activity?.worksheetFields?.[0]?.id;
  const direct = fieldId ? cleanText(values[fieldId]) : undefined;
  if (direct) return direct;
  return matchingValue(values, /task.*name|title|routine|focus/i);
}

function matchingValue(values: Record<string, unknown>, pattern: RegExp) {
  for (const [key, value] of Object.entries(values)) {
    if (!pattern.test(key)) continue;
    const text = cleanText(value);
    if (text) return text;
  }
  return undefined;
}

function scalarText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).join(", ") || undefined;
  }
  return cleanText(value);
}

function cleanText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || undefined;
}

function joinSections(values: Array<string | undefined>) {
  return values.filter(Boolean).join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
