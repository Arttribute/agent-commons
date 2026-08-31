import mongoose from "mongoose";
import { buildLiveCheckInContext } from "../lib/check-in-context.ts";

const COURSE_SLUG = "ai-quick-wins-for-leaders";
const SESSION_ID = "6a8490f63085a3ad64e0da34";
const OWNER_EMAIL = "bashybaranaba@gmail.com";
const PREVIEW_EMAIL = "bashybaranaba@gmail.com";
const CHECK_IN_TITLE = "Your AI Quick Wins outcome check-in";
const CHECK_IN_INSTRUCTIONS =
  "Look back at your outcome contract, choose a one-on-one time, then share: (1) the concrete steps you have taken since the workshop; (2) what changed as a result; (3) how you are measuring progress, including any baseline, current measure, or evidence; (4) your next step and when you will take it; and (5) any blocker or support you need. Small, specific progress is useful.";
const MEETING_SLOTS = buildMeetingSlots();

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const sendPreview = args.has("--send-preview");

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
if (sendPreview && !process.env.ADMIN_SECRET) {
  throw new Error("ADMIN_SECRET is required to send the preview.");
}

await mongoose.connect(process.env.MONGODB_URI);
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is unavailable.");
  const course = await db.collection("courses").findOne({ slug: COURSE_SLUG });
  if (!course) throw new Error(`Course ${COURSE_SLUG} was not found.`);
  const session = await db.collection("livesessions").findOne({
    _id: new mongoose.Types.ObjectId(SESSION_ID),
    courseId: course._id,
  });
  if (!session) throw new Error("The AI Quick Wins live session was not found.");
  const [owner, participants, responses] = await Promise.all([
    db.collection("users").findOne({ email: OWNER_EMAIL }),
    db
      .collection("liveparticipants")
      .find({ sessionId: session._id })
      .sort({ joinedAt: 1 })
      .toArray(),
    db
      .collection("liveresponses")
      .find({ sessionId: session._id })
      .sort({ submittedAt: -1 })
      .toArray(),
  ]);
  if (!owner) throw new Error(`Educator ${OWNER_EMAIL} was not found.`);
  const previewLearner = participants.find(
    (participant) => participant.email?.toLowerCase() === PREVIEW_EMAIL,
  );
  if (!previewLearner) {
    throw new Error(`Preview learner ${PREVIEW_EMAIL} was not found in the room.`);
  }

  const facilitatorUserIds = new Set([
    String(owner._id),
    ...(course.collaborators || []).map((item) => String(item.userId || "")),
  ]);
  const cohort = participants.filter(
    (participant) => !facilitatorUserIds.has(String(participant.userId)),
  );
  const targetContexts = cohort.map((participant) => {
    const context = buildLiveCheckInContext({
      activities: session.activities || [],
      responses,
      userId: participant.userId,
    });
    return {
      userId: participant.userId,
      context:
        context?.context ||
        [
          "Your outcome contract was not captured in CommonLab",
          "Start this check-in by restating the outcome you want from AI Quick Wins and the evidence or measure that will tell you it is working. Then share the steps you have taken so far.",
        ].join("\n\n"),
      source: context?.source || "not_captured",
    };
  });
  const coverage = new Set(targetContexts.map((item) => String(item.userId)));
  const missing = cohort.filter(
    (participant) => !coverage.has(String(participant.userId)),
  );

  const summary = {
    dryRun: !apply,
    course: course.title,
    session: session.title,
    cohortLearners: cohort.length,
    personalizedContracts: targetContexts.length,
    missingContracts: missing.map((participant) => participant.email),
    previewRecipient: PREVIEW_EMAIL,
    oneOnOneSlots: MEETING_SLOTS.length,
    oneOnOneWindow: "Tuesday and Thursday evenings through September 17, 2026 · Africa/Nairobi",
    prompt: CHECK_IN_INSTRUCTIONS,
  };
  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = missing.length ? 2 : 0;
  } else {
    const now = new Date();
    const shared = {
      courseId: course._id,
      educatorId: owner._id,
      title: CHECK_IN_TITLE,
      instructions: CHECK_IN_INSTRUCTIONS,
      points: 0,
      acceptsText: true,
      acceptsUrl: true,
      kind: "follow_up",
      sourceLiveSessionId: session._id,
      meetingSlots: MEETING_SLOTS,
      meetingSlotRequired: true,
      updatedAt: now,
    };
    const draft = await db.collection("assignments").findOneAndUpdate(
      {
        courseId: course._id,
        checkInKey: "ai-quick-wins-outcome-accountability-v1",
      },
      {
        $set: {
          ...shared,
          checkInKey: "ai-quick-wins-outcome-accountability-v1",
          targetUserIds: cohort.map((participant) => participant.userId),
          targetContexts,
        },
        $setOnInsert: { createdAt: now, published: false },
      },
      { upsert: true, returnDocument: "after" },
    );
    const preview = await db.collection("assignments").findOneAndUpdate(
      {
        courseId: course._id,
        checkInKey: "ai-quick-wins-outcome-accountability-preview-bashy-v1",
      },
      {
        $set: {
          ...shared,
          title: `${CHECK_IN_TITLE} · preview`,
          checkInKey:
            "ai-quick-wins-outcome-accountability-preview-bashy-v1",
          targetUserIds: [previewLearner.userId],
          targetContexts: [
            {
              userId: previewLearner.userId,
              source: "manual",
              context: [
                "Preview outcome contract for Bashy",
                "Outcome: Turn one recurring CommonLab workshop follow-up into a reliable accountability workflow that helps each learner act on the goal they set.",
                "How you will know it worked: The learner receives a personalized reminder, records concrete steps and evidence, names a next action, and the facilitator can see whether the check-in was sent, opened, started, and submitted.",
              ].join("\n\n"),
            },
          ],
          published: true,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );
    let emailResult;
    if (sendPreview) {
      const baseUrl = (
        process.env.COURSES_APP_URL || "https://commonlab.agentcommons.io"
      ).replace(/\/$/, "");
      const response = await fetch(
        `${baseUrl}/api/educator/assignments/${preview._id}/notifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-secret": process.env.ADMIN_SECRET,
          },
          body: JSON.stringify({ userIds: [String(previewLearner.userId)] }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          `Preview email failed (${response.status}): ${payload.error || "Unknown error"}`,
        );
      }
      emailResult = payload.results;
    }
    console.log(
      JSON.stringify(
        {
          ...summary,
          draftAssignmentId: String(draft._id),
          previewAssignmentId: String(preview._id),
          previewSent: Boolean(sendPreview),
          emailResult,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await mongoose.disconnect();
}

function buildMeetingSlots() {
  const days = ["2026-09-01", "2026-09-03", "2026-09-08", "2026-09-10", "2026-09-15", "2026-09-17"];
  const times = [
    { id: "1730", start: "14:30:00.000Z", end: "15:00:00.000Z" },
    { id: "1830", start: "15:30:00.000Z", end: "16:00:00.000Z" },
    { id: "1930", start: "16:30:00.000Z", end: "17:00:00.000Z" },
  ];
  return days.flatMap((day) =>
    times.map((time) => ({
      id: `${day}-${time.id}`,
      startAt: new Date(`${day}T${time.start}`),
      endAt: new Date(`${day}T${time.end}`),
      timezone: "Africa/Nairobi",
      capacity: 1,
    })),
  );
}
