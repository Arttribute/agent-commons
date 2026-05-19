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
const secondInstallmentDueAt = new Date(
  startDate.getTime() + 7 * 24 * 60 * 60 * 1000
);
const secondInstallmentGraceEndsAt = new Date(
  secondInstallmentDueAt.getTime() + 3 * 24 * 60 * 60 * 1000
);

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
      installmentPlan: {
        enabled: true,
        label: "2-payment plan",
        installmentAmount: 6000,
        installmentCount: 2,
        releaseAccess: "full_after_first_payment",
      },
      updatedAt: new Date(),
    },
  }
);

console.log(
  `Updated ${result.modifiedCount} AI Quick Wins course document(s); matched ${result.matchedCount}.`
);

const courses = await mongoose.connection
  .collection("courses")
  .find(
    {
      $or: [
        { slug: /ai-quick-wins/i },
        { title: /ai quick wins/i },
        { title: /quick wins.*leaders/i },
      ],
    },
    { projection: { _id: 1 } }
  )
  .toArray();

if (courses.length > 0) {
  const enrollmentResult = await mongoose.connection
    .collection("enrollments")
    .updateMany(
      {
        courseId: { $in: courses.map((course) => course._id) },
        paymentStatus: { $in: ["partial", "overdue"] },
        currentInstallment: 1,
        paidAmount: { $lt: 12000 },
      },
      {
        $set: {
          nextPaymentDueAt: secondInstallmentDueAt,
          paymentGraceEndsAt: secondInstallmentGraceEndsAt,
          updatedAt: new Date(),
        },
      }
    );

  console.log(
    `Backfilled installment due dates for ${enrollmentResult.modifiedCount} enrollment(s).`
  );
}

await mongoose.disconnect();
