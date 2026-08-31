import mongoose from "mongoose";

const sessionId = "6a7d76665ca03a4a097ff615";
const dryRun = process.argv.includes("--dry-run");
const slideStarts = new Map([
  ["Arrival, onboarding, and room orientation", 1],
  ["Welcome, outcomes, and the Zawadi scenario", 2],
  ["Getting useful results from Claude", 14],
  ["Claude as your personal assistant", 25],
  ["Everyday-work gallery: five live demos", 34],
  ["Build a Skill: trigger, instructions, and test", 44],
  ["Work safely and connect only what you need", 55],
  ["Choose the two or three workflows that pay off", 63],
]);

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable.");
  const objectId = new mongoose.Types.ObjectId(sessionId);
  const session = await db.collection("livesessions").findOne({ _id: objectId });
  if (!session) throw new Error("The Moringa live session was not found.");
  const mapped = [];
  const activities = session.activities.map((source) => {
    const activity = normalizeArtifactTerminology(source);
    const materialStartSlide = slideStarts.get(activity.title);
    if (materialStartSlide) {
      activity.materialStartSlide = materialStartSlide;
      mapped.push(activity.title);
    }
    if (activity.title === "Warm-up: what would you hand to Claude?") {
      activity.allowOther = true;
    }
    if (activity.title === "Exit confidence") {
      activity.responseStyle = "scale";
    }
    return activity;
  });
  const missing = [...slideStarts.keys()].filter((title) => !mapped.includes(title));
  if (missing.length) throw new Error(`Missing slide activities: ${missing.join(", ")}`);
  const changed = JSON.stringify(activities) !== JSON.stringify(session.activities);
  if (changed && !dryRun) {
    await db.collection("livesessions").updateOne(
      { _id: objectId },
      {
        $set: { activities, updatedAt: new Date() },
        $inc: { stateVersion: 1 },
      },
    );
  }
  console.log(
    JSON.stringify(
      {
        sessionId,
        changed,
        dryRun,
        warmUpAllowsOther: activities.find(
          (activity) => activity.title === "Warm-up: what would you hand to Claude?",
        )?.allowOther,
        exitResponseStyle: activities.find(
          (activity) => activity.title === "Exit confidence",
        )?.responseStyle,
        slideStarts: activities
          .filter((activity) => activity.materialStartSlide)
          .map((activity) => ({
            title: activity.title,
            slide: activity.materialStartSlide,
          })),
      },
      null,
      2,
    ),
  );
} finally {
  await mongoose.disconnect();
}

function normalizeArtifactTerminology(activity) {
  const next = { ...activity };
  for (const field of [
    "title",
    "prompt",
    "instructions",
    "successCriteria",
    "facilitatorNotes",
  ]) {
    if (typeof next[field] === "string") next[field] = replaceArtifact(next[field]);
  }
  if (Array.isArray(next.options)) {
    next.options = next.options.map((option) => ({
      ...option,
      label: replaceArtifact(option.label),
    }));
  }
  return next;
}

function replaceArtifact(value) {
  if (typeof value !== "string") return value;
  return value.replaceAll("Artefact", "Artifact").replaceAll("artefact", "artifact");
}
