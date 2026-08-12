import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
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
  const course = await Course.findById(session.courseId).select("title published isFree");
  if (!course?.published) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  const email = currentUser.user.email?.trim().toLowerCase() || "";
  if (session.access === "invited" && !session.invitedEmails.includes(email)) {
    return NextResponse.json({ error: "This session is limited to invited learners." }, { status: 403 });
  }
  if (session.access === "enrolled") {
    const enrolled = await Enrollment.exists({
      userId: currentUser.user.id,
      courseId: session.courseId,
      status: { $ne: "cancelled" },
    });
    if (!enrolled) {
      if (!course.isFree) {
        return NextResponse.json({ error: "Enroll in the course before joining this session." }, { status: 403 });
      }
      await Enrollment.findOneAndUpdate(
        { userId: currentUser.user.id, courseId: session.courseId },
        { $setOnInsert: { status: "active", paymentStatus: "free", accessLevel: "full" } },
        { upsert: true },
      );
    }
  }
  if (session.status === "ended") {
    const existing = await LiveParticipant.findOne({
      sessionId: session._id,
      userId: currentUser.user.id,
    });
    if (!existing) {
      return NextResponse.json({ error: "This session has ended." }, { status: 410 });
    }
  }
  if (!session.settings.allowLateJoin && session.status === "live") {
    const existing = await LiveParticipant.exists({
      sessionId: session._id,
      userId: currentUser.user.id,
    });
    if (!existing) {
      return NextResponse.json({ error: "Joining is now closed." }, { status: 403 });
    }
  }
  const participant = await LiveParticipant.findOneAndUpdate(
    { sessionId: session._id, userId: currentUser.user.id },
    {
      $set: {
        displayName: currentUser.user.name || currentUser.user.email || "Learner",
        email,
        lastSeenAt: new Date(),
        status: session.status === "ended" ? "completed" : "active",
      },
      $setOnInsert: { courseId: session.courseId, joinedAt: new Date() },
    },
    { new: true, upsert: true },
  );
  const [base, responses, results] = await Promise.all([
    serializeEducatorLiveSession(session, course.title),
    getLearnerResponses(session._id, participant._id),
    getSessionResults(session, false),
  ]);
  const visibleResults = Object.fromEntries(
    Object.entries(results).filter(([activityId]) => {
      const activity = session.activities.find((item: LiveActivity) => item.id === activityId);
      return activity?.showResults && activity.status === "closed";
    }),
  );
  return NextResponse.json({
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
  });
}
