import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI;
const sessionId = "6a7d76665ca03a4a097ff615";
const workspaceId = "6a7e4b847bae35c601e113f9";
const dryRun = process.argv.includes("--dry-run");

const entryPaths = new Map([
  ["Claude and Cowork setup check", "01_Setup/Pre_Workshop_Setup_Guide.md"],
  ["Lab 1: ask well", "03_Block1_Ask_Well"],
  [
    "Lab 2A: clear the Zawadi inbox",
    "04_Block2_Assistant/zawadi_monday_inbox.md",
  ],
  ["Lab 2B: run the Zawadi desk", "04_Block2_Assistant/Recording_Lab"],
  ["Everyday-work gallery: five live demos", "05_Block3_Gallery"],
  ["Lab 3: pick what fits your work", "05_Block3_Gallery"],
  ["Gallery pair share", "05_Block3_Gallery"],
  [
    "Build a Skill: trigger, instructions, and test",
    "06_Block4_Skills/Skill_Gallery",
  ],
  ["Lab 4: build and test your Skill", "06_Block4_Skills"],
  [
    "Work safely and connect only what you need",
    "07_Block5_Safety/Responsible_Use_Checklist.pdf",
  ],
  ["Lab 5: de-risk a real workflow", "07_Block5_Safety"],
  ["Your first-week plan", "08_Block6_Plan/First_Week_Plan.md"],
]);

if (!mongoUri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

await mongoose.connect(mongoUri);
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable.");
  const objectId = new mongoose.Types.ObjectId(sessionId);
  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
  const [session, workspace] = await Promise.all([
    db.collection("livesessions").findOne({ _id: objectId }),
    db.collection("labworkspaces").findOne({ _id: workspaceObjectId }),
  ]);
  if (!session) throw new Error("The Moringa live session was not found.");
  if (!workspace) throw new Error("The Moringa lab workspace was not found.");

  const availablePaths = workspace.files.map((file) => file.path);
  for (const target of entryPaths.values()) {
    const exists = availablePaths.some(
      (candidate) => candidate === target || candidate.startsWith(`${target}/`),
    );
    if (!exists) throw new Error(`Lab entry target does not exist: ${target}`);
  }

  const matched = [];
  let changed = false;
  const activities = session.activities.map((activity) => {
    const labEntryPath = entryPaths.get(activity.title);
    if (!labEntryPath) return activity;
    matched.push(activity.title);
    if (
      activity.labWorkspaceId === workspaceId &&
      activity.labEntryPath === labEntryPath
    ) {
      return activity;
    }
    changed = true;
    return { ...activity, labWorkspaceId: workspaceId, labEntryPath };
  });
  if (matched.length !== entryPaths.size) {
    const missing = [...entryPaths.keys()].filter(
      (title) => !matched.includes(title),
    );
    throw new Error(`Could not find mapped activities: ${missing.join(", ")}`);
  }
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
        workspaceId,
        changed,
        dryRun,
        mappedActivities: activities
          .filter((activity) => entryPaths.has(activity.title))
          .map((activity) => ({
            title: activity.title,
            labEntryPath: activity.labEntryPath,
          })),
      },
      null,
      2,
    ),
  );
} finally {
  await mongoose.disconnect();
}
