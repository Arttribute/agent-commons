import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI;
const ownerEmail = "bashybaranaba@gmail.com";
const liveSessionId = "6a7d76665ca03a4a097ff615";
const targetSlug = "claude-skills-for-everyday-work-moringa";

if (!mongoUri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

await mongoose.connect(mongoUri);

try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable.");

  const users = db.collection("users");
  const courses = db.collection("courses");
  const sessions = db.collection("livesessions");
  const materials = db.collection("coursematerials");
  const participants = db.collection("liveparticipants");
  const enrollments = db.collection("enrollments");

  const owner = await users.findOne({ email: ownerEmail });
  if (!owner) throw new Error(`Owner not found: ${ownerEmail}`);

  const session = await sessions.findOne({
    _id: new mongoose.Types.ObjectId(liveSessionId),
  });
  if (!session) throw new Error(`Live session not found: ${liveSessionId}`);

  const sourceCourse = await courses.findOne({ _id: session.courseId });
  if (!sourceCourse) throw new Error("Source course was not found.");

  const now = new Date();
  const scheduledStart =
    session.scheduledStart || new Date("2026-08-15T05:30:00.000Z");
  const target = await courses.findOneAndUpdate(
    { slug: targetSlug },
    {
      $set: {
        title: "Claude Skills for Everyday Work · Moringa",
        tagline:
          "A private, facilitator-led Moringa workshop for turning repeated work into reusable Claude Skills.",
        description:
          "A hands-on, one-day workshop combining guided presentation, live checks, practical labs, reflection, and a first-week implementation plan.",
        longDescription:
          "<p>This private Moringa cohort course supports the live Claude Skills for Everyday Work workshop. Learners move through facilitator-paced slides, live polls and retrieval checks, hands-on labs, reflection, and an implementation plan.</p>",
        price: 0,
        currency: "USD",
        isFree: true,
        courseType: "live",
        startDate: scheduledStart,
        nextSessionDate: scheduledStart,
        sessionDates: [scheduledStart],
        liveSchedule: {
          cadence: "custom",
          dayOfWeek: "saturday",
          time: "08:30",
          timezone: "Africa/Nairobi",
          sessionsCount: 1,
          description:
            "Private, in-person workshop from 8:30 AM to 5:30 PM EAT.",
        },
        level: "beginner",
        duration: "1 day · 9 hours",
        lessonsCount: 28,
        modulesCount: 5,
        instructor:
          sourceCourse.instructor || owner.name || "Moringa facilitator",
        educator: {
          ...(sourceCourse.educator || {}),
          userId: owner._id,
          name: sourceCourse.educator?.name || owner.name,
        },
        collaborators: [],
        tags: [
          "Claude",
          "Skills",
          "Moringa",
          "live workshop",
          "facilitator-led",
        ],
        modules: [
          {
            title: "Foundations and setup",
            description:
              "Set up Claude and identify repeated work worth improving.",
            lessons: [],
          },
          {
            title: "Prompting for useful results",
            description: "Practise clear requests and retrieval checks.",
            lessons: [],
          },
          {
            title: "Claude in everyday work",
            description:
              "Apply Claude to inbox, meeting, research, and desk workflows.",
            lessons: [],
          },
          {
            title: "Build a reusable Skill",
            description:
              "Define a trigger, instructions, inputs, outputs, and tests.",
            lessons: [],
          },
          {
            title: "Safety and first-week plan",
            description:
              "Use a practical safety checklist and plan adoption after the workshop.",
            lessons: [],
          },
        ],
        agents: sourceCourse.agents || [],
        published: true,
        catalogVisibility: "private",
        isMainFeatured: false,
        isFeatured: false,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!target) throw new Error("Target course could not be created.");

  const materialIds = [
    ...new Set(
      (session.activities || [])
        .map((activity) => activity.materialId)
        .filter((value) => mongoose.Types.ObjectId.isValid(value))
        .map(String),
    ),
  ].map((value) => new mongoose.Types.ObjectId(value));

  const [sessionResult, materialResult] = await Promise.all([
    sessions.updateOne(
      { _id: session._id },
      {
        $set: {
          courseId: target._id,
          courseSlug: target.slug,
          createdBy: owner._id,
          access: "enrolled",
          updatedAt: now,
        },
        $inc: { stateVersion: 1 },
      },
    ),
    materialIds.length
      ? materials.updateMany(
          { _id: { $in: materialIds } },
          {
            $set: {
              courseId: target._id,
              courseSlug: target.slug,
              ownerUserId: owner._id,
              updatedAt: now,
            },
          },
        )
      : Promise.resolve({ matchedCount: 0, modifiedCount: 0 }),
  ]);

  const participantUserIds = await participants.distinct("userId", {
    sessionId: session._id,
    userId: { $ne: owner._id },
  });
  let enrollmentCount = 0;
  for (const userId of participantUserIds) {
    await enrollments.updateOne(
      { userId, courseId: target._id },
      {
        $set: { status: "active", updatedAt: now },
        $setOnInsert: {
          accessLevel: "full",
          paymentStatus: "free",
          accessSource: "free",
          paidAmount: 0,
          totalAmountDue: 0,
          currentInstallment: 0,
          enrolledAt: now,
          progress: 0,
          completedLessons: [],
          points: 0,
          streak: 0,
          longestStreak: 0,
          completedChallenges: [],
          challengeAnswers: {},
          sandboxStates: {},
          practicalSignals: [],
          createdAt: now,
        },
      },
      { upsert: true },
    );
    enrollmentCount += 1;
  }

  console.log(
    JSON.stringify(
      {
        owner: owner.email,
        targetCourse: {
          id: String(target._id),
          slug: target.slug,
          visibility: target.catalogVisibility,
        },
        liveSession: {
          id: liveSessionId,
          matched: sessionResult.matchedCount,
          moved: sessionResult.modifiedCount,
        },
        materials: {
          matched: materialResult.matchedCount,
          moved: materialResult.modifiedCount,
        },
        participantEnrollmentsEnsured: enrollmentCount,
      },
      null,
      2,
    ),
  );
} finally {
  await mongoose.disconnect();
}
