import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { getCourseCollaboratorRole } from "@/lib/educator-auth";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import LabWorkspace from "@/models/LabWorkspace";
import LiveParticipant from "@/models/LiveParticipant";
import LiveSession from "@/models/LiveSession";

export async function authorizeLabWorkspace(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
  if (!Types.ObjectId.isValid(id)) {
    return {
      error: NextResponse.json(
        { error: "Lab workspace not found." },
        { status: 404 },
      ),
    };
  }
  await connectDB();
  const workspace = await LabWorkspace.findById(id);
  if (!workspace) {
    return {
      error: NextResponse.json(
        { error: "Lab workspace not found." },
        { status: 404 },
      ),
    };
  }
  const course = await Course.findById(workspace.courseId);
  if (!course) {
    return {
      error: NextResponse.json(
        { error: "Lab workspace not found." },
        { status: 404 },
      ),
    };
  }
  const manages =
    session.user.role === "admin" ||
    course.educator?.userId?.toString() === session.user.id ||
    Boolean(
      getCourseCollaboratorRole(course, {
        userId: session.user.id,
        email: session.user.email,
      }),
    );
  if (!manages && !course.published) {
    return {
      error: NextResponse.json(
        { error: "Lab workspace not found." },
        { status: 404 },
      ),
    };
  }
  if (!manages && workspace.visibility === "live") {
    const sessionIds = await LiveSession.find({
      courseId: workspace.courseId,
      "activities.labWorkspaceId": String(workspace._id),
    }).distinct("_id");
    const attended = await LiveParticipant.exists({
      sessionId: { $in: sessionIds },
      userId: session.user.id,
    });
    if (!attended) {
      return {
        error: NextResponse.json(
          { error: "This lab is limited to live-session participants." },
          { status: 403 },
        ),
      };
    }
  } else if (!manages) {
    const enrolled = await Enrollment.exists({
      userId: session.user.id,
      courseId: workspace.courseId,
      status: { $ne: "cancelled" },
    });
    if (!enrolled) {
      return {
        error: NextResponse.json(
          { error: "This lab is limited to enrolled learners." },
          { status: 403 },
        ),
      };
    }
  }
  return { error: null, session, course, workspace, manages };
}
