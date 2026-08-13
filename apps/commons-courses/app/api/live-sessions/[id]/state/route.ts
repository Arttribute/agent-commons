import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { getCourseCollaboratorRole } from "@/lib/educator-auth";
import { resolveCurrentActivityId } from "@/lib/live-session-data";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import LiveParticipant from "@/models/LiveParticipant";
import LiveSession from "@/models/LiveSession";
import type { LiveActivity } from "@/types/live-session";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await auth();
  if (!currentUser?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  }
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Session not found." }, { status: 404, headers: noStore });
  }

  await connectDB();
  const session = await LiveSession.findById(id).select(
    "courseId status pace access invitedEmails currentActivityId stateVersion activities.id activities.status settings.allowLateJoin",
  );
  if (!session || session.status === "draft") {
    return NextResponse.json({ error: "Session not found." }, { status: 404, headers: noStore });
  }

  const [course, participant] = await Promise.all([
    Course.findById(session.courseId).select("published educator collaborators"),
    LiveParticipant.exists({ sessionId: session._id, userId: currentUser.user.id }),
  ]);
  if (!course?.published) {
    return NextResponse.json({ error: "Session not found." }, { status: 404, headers: noStore });
  }
  const email = currentUser.user.email?.trim().toLowerCase() || "";
  const managesCourse = currentUser.user.role === "admin"
    || course.educator?.userId?.toString() === currentUser.user.id
    || Boolean(getCourseCollaboratorRole(course, { userId: currentUser.user.id, email: currentUser.user.email }));
  if (!managesCourse && session.access === "invited" && !session.invitedEmails.includes(email)) {
    return NextResponse.json({ error: "This session is limited to invited learners." }, { status: 403, headers: noStore });
  }
  if (!managesCourse && session.access === "enrolled") {
    const enrolled = await Enrollment.exists({
      userId: currentUser.user.id,
      courseId: session.courseId,
      status: { $ne: "cancelled" },
    });
    if (!enrolled) {
      return NextResponse.json({ error: "You no longer have access to this course." }, { status: 403, headers: noStore });
    }
  }
  if (!participant || (session.status === "live" && !session.settings.allowLateJoin)) {
    if (!participant) {
      return NextResponse.json({ error: "Re-enter the live room to continue." }, { status: 409, headers: noStore });
    }
  }

  return NextResponse.json({
    state: {
      status: session.status,
      pace: session.pace,
      currentActivityId: resolveCurrentActivityId(session),
      stateVersion: session.stateVersion || 0,
      activityStatuses: Object.fromEntries(
        session.activities.map((activity: LiveActivity) => [activity.id, activity.status]),
      ),
      serverTime: new Date().toISOString(),
    },
  }, { headers: noStore });
}
