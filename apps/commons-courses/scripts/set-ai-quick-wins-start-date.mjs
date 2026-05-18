import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const startDate = new Date("2026-06-04T00:00:00.000Z");
const sessionDates = [
  new Date("2026-06-04T16:00:00.000Z"),
  new Date("2026-06-11T16:00:00.000Z"),
  new Date("2026-06-18T16:00:00.000Z"),
  new Date("2026-06-25T16:00:00.000Z"),
];

await mongoose.connect(uri);

const result = await mongoose.connection.collection("courses").updateMany(
  {
    $or: [
      { slug: /ai-quick-wins/i },
      { title: /ai quick wins/i },
      { title: /quick wins.*leaders/i },
    ],
  },
  {
    $set: {
      courseType: "live",
      startDate,
      nextSessionDate: sessionDates[0],
      sessionDates,
      liveSchedule: {
        cadence: "weekly",
        dayOfWeek: "thursday",
        time: "19:00",
        timezone: "EAT",
        sessionsCount: 4,
        description:
          "Weekly live classes on Thursdays at 7:00 PM EAT for four weeks. The 24 lessons are the course content library; live classes are cohort sessions for walkthroughs, discussion, and support.",
      },
      updatedAt: new Date(),
    },
  }
);

console.log(
  `Updated ${result.modifiedCount} AI Quick Wins course document(s); matched ${result.matchedCount}.`
);

await mongoose.disconnect();
