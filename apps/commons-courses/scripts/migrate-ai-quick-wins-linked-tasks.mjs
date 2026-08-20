import mongoose from "mongoose";

const sessionId = "6a8490f63085a3ad64e0da34";
const oldActivityIds = [1, 2, 3, 4].map(
  (card) => `discover-task-anatomy-${card}`,
);
const collectionId = "discover-task-anatomies";
const scorecardId = "discover-final-choice";
const criteria = [
  ["frequency", "Frequency"],
  ["time", "Time cost"],
  ["repeatability", "Repeatability"],
  ["verifiability", "Verifiability"],
  ["reversibility", "Reversibility"],
  ["access", "Data access"],
  ["judgment", "Low judgment density"],
].map(([id, label]) => ({
  id,
  label,
  min: 1,
  max: 5,
  lowLabel: "Low",
  highLabel: "High",
}));
const fields = [
  field("task-name", "1. Task name", "short_text", true, "Six words or fewer"),
  field("task-trigger", "2. What triggers it?", "long_text", true),
  field("task-frequency", "3. How often, and how long does it take?"),
  field("task-tools", "4. Which tools or apps are involved?"),
  field("task-inputs", "5. What inputs are needed, and where do they live?"),
  field("task-steps", "6. What are the steps?", "long_text", true),
  field("task-judgment", "7. Where do you pause and think?"),
  field("task-exceptions", "8. What exceptions change the process?"),
  field(
    "task-quality",
    "9. What separates a good result from a bad one?",
    "long_text",
    true,
  ),
  field("task-tacit", "10. What part do you ‘just know’?"),
  field("task-loss", "11. What would be lost if this were delegated?"),
  field("task-never", "12. What should AI never give up?"),
];

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
await mongoose.connect(process.env.MONGODB_URI);
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable.");
  const sessions = db.collection("livesessions");
  const responses = db.collection("liveresponses");
  const session = await sessions.findOne({
    _id: new mongoose.Types.ObjectId(sessionId),
  });
  if (!session) throw new Error(`Live session not found: ${sessionId}`);
  const activities = Array.isArray(session.activities)
    ? session.activities
    : [];
  const oldActivities = activities.filter((activity) =>
    oldActivityIds.includes(activity.id),
  );
  const existingCollection = activities.find(
    (activity) => activity.id === collectionId,
  );
  const firstIndex = Math.min(
    ...oldActivities.map((activity) =>
      activities.findIndex((candidate) => candidate.id === activity.id),
    ),
  );
  const source = existingCollection || oldActivities[0];
  if (!source) throw new Error("Task anatomy activities were not found.");
  const status =
    session.pace === "learner" ||
    oldActivities.some((activity) => activity.status === "open")
      ? "open"
      : oldActivities.every((activity) => activity.status === "closed")
        ? "closed"
        : "draft";
  const collectionActivity = {
    ...source,
    id: collectionId,
    type: "card_collection",
    title: "Task anatomy cards",
    prompt:
      "Unpack each shortlisted routine and surface the judgment hidden inside it.",
    instructions:
      "Add one card for every task you want to examine. Work from the real task, not the ideal process. You can create as many cards as you need, save progress, and return to any card.",
    successCriteria:
      "Each card names the steps, at least one decision point, an exception, and what good looks like.",
    estimatedMinutes: 20,
    status,
    minItems: 1,
    itemTitleFieldId: "task-name",
    worksheetFields: fields,
    scoreCriteria: [],
    options: [],
  };
  const oldScorecard = activities.find(
    (activity) => activity.id === scorecardId,
  );
  if (!oldScorecard) throw new Error("Final-choice activity was not found.");
  const scorecardActivity = {
    ...oldScorecard,
    type: "linked_scorecard",
    prompt:
      "Score the tasks you just unpacked and choose the first one you will carry through all four sessions.",
    instructions:
      "Your task cards are already here. Score each one for frequency, time cost, repeatability, verifiability, reversibility, data access, and judgment density—then choose your first build.",
    successCriteria:
      "Choose one task and explain why it is a safe, useful first build.",
    sourceActivityId: collectionId,
    selectionPrompt: "Choose the first task you will offload.",
    scoreCriteria: criteria,
    worksheetFields: [],
    options: [],
    status: session.pace === "learner" ? "open" : oldScorecard.status,
  };

  const oldResponses = await responses
    .find({ sessionId: session._id, activityId: { $in: oldActivityIds } })
    .toArray();
  const byParticipant = Map.groupBy(oldResponses, (response) =>
    String(response.participantId),
  );
  let migratedCollections = 0;
  for (const participantResponses of byParticipant.values()) {
    const ordered = oldActivityIds.flatMap((activityId) =>
      participantResponses.filter(
        (response) => response.activityId === activityId,
      ),
    );
    const items = ordered.flatMap((response, index) => {
      const values = response.value?.values;
      if (!values || typeof values !== "object") return [];
      const normalized = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key.replace(/^task-\d+-/, "task-"),
          value,
        ]),
      );
      return Object.keys(normalized).length
        ? [{ id: `migrated-${index + 1}`, values: normalized }]
        : [];
    });
    if (!items.length) continue;
    const base = ordered.at(-1);
    await responses.updateOne(
      {
        sessionId: session._id,
        activityId: collectionId,
        participantId: base.participantId,
      },
      {
        $set: {
          courseId: base.courseId,
          userId: base.userId,
          value: {
            items,
            finalized: ordered.every((response) => response.value?.finalized),
          },
          submittedAt: base.submittedAt || new Date(),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date(), pointsAwarded: 0 },
      },
      { upsert: true },
    );
    migratedCollections += 1;
  }
  const [scorecardResponses, collectionResponses] = await Promise.all([
    responses
      .find({ sessionId: session._id, activityId: scorecardId })
      .toArray(),
    responses
      .find({ sessionId: session._id, activityId: collectionId })
      .toArray(),
  ]);
  let migratedScorecards = 0;
  for (const response of scorecardResponses) {
    const oldValues = response.value?.values;
    if (!oldValues || typeof oldValues !== "object") continue;
    const collectionResponse = collectionResponses.find(
      (candidate) =>
        String(candidate.participantId) === String(response.participantId),
    );
    const sourceItems = collectionResponse?.value?.items;
    if (!Array.isArray(sourceItems) || !sourceItems.length) continue;
    const items = sourceItems.map((sourceItem, index) => ({
      sourceItemId: sourceItem.id,
      scores: Object.fromEntries(
        criteria.flatMap((criterion) => {
          const value = Number(
            oldValues[`score-task-${index + 1}-${criterion.id}`],
          );
          return Number.isInteger(value) &&
            value >= criterion.min &&
            value <= criterion.max
            ? [[criterion.id, value]]
            : [];
        }),
      ),
    }));
    const selectedText = String(oldValues["selected-task"] || "")
      .trim()
      .toLocaleLowerCase();
    const selected = selectedText
      ? sourceItems.find((item) =>
          String(item.values?.["task-name"] || "")
            .trim()
            .toLocaleLowerCase()
            .includes(selectedText),
        )
      : undefined;
    const finalized = Boolean(
      selected &&
        items.every((item) =>
          criteria.every(
            (criterion) => item.scores[criterion.id] !== undefined,
          ),
        ),
    );
    await responses.updateOne(
      { _id: response._id },
      {
        $set: {
          value: {
            items,
            selectedItemId: selected?.id,
            selectionReason: oldValues["selection-reason"],
            finalized,
          },
          updatedAt: new Date(),
        },
      },
    );
    migratedScorecards += 1;
  }

  const withoutOld = activities.filter(
    (activity) => !oldActivityIds.includes(activity.id),
  );
  const collectionIndex = withoutOld.findIndex(
    (activity) => activity.id === collectionId,
  );
  if (collectionIndex >= 0) withoutOld[collectionIndex] = collectionActivity;
  else
    withoutOld.splice(
      Number.isFinite(firstIndex) && firstIndex >= 0 ? firstIndex : 9,
      0,
      collectionActivity,
    );
  const scorecardIndex = withoutOld.findIndex(
    (activity) => activity.id === scorecardId,
  );
  withoutOld[scorecardIndex] = scorecardActivity;
  await sessions.updateOne(
    { _id: session._id },
    {
      $set: {
        activities: withoutOld,
        currentActivityId: oldActivityIds.includes(session.currentActivityId)
          ? collectionId
          : session.currentActivityId,
        updatedAt: new Date(),
      },
      $inc: { stateVersion: 1 },
    },
  );
  console.log(
    JSON.stringify({
      sessionId,
      activities: withoutOld.length,
      migratedCollections,
      migratedScorecards,
    }),
  );
} finally {
  await mongoose.disconnect();
}

function field(id, label, type = "long_text", required = false, placeholder) {
  return { id, label, type, required, placeholder };
}
