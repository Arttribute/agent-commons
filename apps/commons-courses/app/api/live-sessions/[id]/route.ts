import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { getCourseCollaboratorRole } from "@/lib/educator-auth";
import {
  getLearnerResponses,
  getSessionResults,
  learnerSafeActivities,
  serializeEducatorLiveSession,
} from "@/lib/live-session-data";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import LiveParticipant from "@/models/LiveParticipant";
import LiveSession from "@/models/LiveSession";
import type { LiveActivity } from "@/types/live-session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await auth();
  if (!currentUser?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  await connectDB();
  const session = await LiveSession.findById(id);
  if (!session || session.status === "draft") {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  const course = await Course.findById(session.courseId).select(
    "title published isFree educator collaborators theme",
  );
  if (!course?.published) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  const email = currentUser.user.email?.trim().toLowerCase() || "";
  const managesCourse =
    currentUser.user.role === "admin" ||
    course.educator?.userId?.toString() === currentUser.user.id ||
    Boolean(
      getCourseCollaboratorRole(course, {
        userId: currentUser.user.id,
        email: currentUser.user.email,
      }),
    );
  if (
    !managesCourse &&
    session.access === "invited" &&
    !session.invitedEmails.includes(email)
  ) {
    return NextResponse.json(
      { error: "This session is limited to invited learners." },
      { status: 403 },
    );
  }
  if (!managesCourse && session.access === "enrolled") {
    const enrolled = await Enrollment.exists({
      userId: currentUser.user.id,
      courseId: session.courseId,
      status: { $ne: "cancelled" },
    });
    if (!enrolled) {
      return NextResponse.json(
        {
          code: "ENROLLMENT_REQUIRED",
          error: `Enroll in ${course.title} to join this live session.`,
          course: {
            id: String(course._id),
            title: course.title,
            slug: session.courseSlug,
            isFree: course.isFree,
          },
        },
        { status: 403 },
      );
    }
  }
  if (session.status === "ended") {
    const existing = await LiveParticipant.findOne({
      sessionId: session._id,
      userId: currentUser.user.id,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "This session has ended." },
        { status: 410 },
      );
    }
  }
  if (
    !managesCourse &&
    !session.settings.allowLateJoin &&
    session.status === "live"
  ) {
    const existing = await LiveParticipant.exists({
      sessionId: session._id,
      userId: currentUser.user.id,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Joining is now closed." },
        { status: 403 },
      );
    }
  }
  const participant = await LiveParticipant.findOneAndUpdate(
    { sessionId: session._id, userId: currentUser.user.id },
    {
      $set: {
        displayName:
          currentUser.user.name || currentUser.user.email || "Learner",
        email,
        lastSeenAt: new Date(),
        status: session.status === "ended" ? "completed" : "active",
      },
      $setOnInsert: { courseId: session.courseId, joinedAt: new Date() },
    },
    { new: true, upsert: true },
  );
  const enrollment = await Enrollment.findOneAndUpdate(
    { userId: currentUser.user.id, courseId: session.courseId },
    {
      $setOnInsert: {
        status: "active",
        accessLevel: "full",
        paymentStatus: "free",
        accessSource: course.isFree ? "free" : "pass",
        enrolledAt: new Date(),
      },
    },
    { new: true, upsert: true },
  );
  if (enrollment.status === "cancelled") {
    enrollment.status = "active";
    enrollment.accessLevel = "full";
    await enrollment.save();
  }
  const [base, responses, results] = await Promise.all([
    serializeEducatorLiveSession(session, course.title, course.theme),
    getLearnerResponses(session._id, participant._id),
    getSessionResults(session, false),
  ]);
  const visibleResults = Object.fromEntries(
    Object.entries(results).filter(([activityId]) => {
      const activity = session.activities.find(
        (item: LiveActivity) => item.id === activityId,
      );
      return activity?.showResults && activity.status === "closed";
    }),
  );
  return NextResponse.json(
    {
    session: {
      ...base,
      invitedEmails: undefined,
      responseCounts: undefined,
      activities: learnerSafeActivities(base.activities),
      participant: {
        id: String(participant._id),
        displayName: participant.displayName,
        status: participant.status,
        joinedAt: participant.joinedAt.toISOString(),
        lastSeenAt: participant.lastSeenAt.toISOString(),
      },
      responses,
      results: visibleResults,
    },
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
