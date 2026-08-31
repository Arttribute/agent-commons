import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { checkInContextForUser } from "@/lib/check-in-context";
import { sendAssignmentNotification } from "@/lib/email/resend";
import Assignment from "@/models/Assignment";
import Course from "@/models/Course";
import User from "@/models/User";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await connectDB();
  const assignment = await Assignment.findById(id);
  if (!assignment || assignment.kind !== "follow_up") {
    return NextResponse.json({ error: "Check-in not found." }, { status: 404 });
  }

  const course = await Course.findById(assignment.courseId).select(
    "_id title slug emailSettings",
  );
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  const adminSecret = req.headers.get("x-admin-secret");
  const isAdmin =
    Boolean(process.env.ADMIN_SECRET) && adminSecret === process.env.ADMIN_SECRET;
  if (!isAdmin) {
    const authorization = await requireEducatorCourse(course.slug);
    if (authorization.error) return authorization.error;
  }

  const body = await req.json().catch(() => ({}));
  const requestedUserIds = Array.isArray(body.userIds)
    ? body.userIds.map(String)
    : [];
  const allowedUserIds = assignment.targetUserIds.map(String);
  const userIds = requestedUserIds.length
    ? requestedUserIds.filter((userId: string) => allowedUserIds.includes(userId))
    : allowedUserIds;
  if (!userIds.length) {
    return NextResponse.json(
      { error: "Choose at least one learner assigned to this check-in." },
      { status: 400 },
    );
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email")
    .lean();
  if (!assignment.published) {
    assignment.published = true;
    await assignment.save();
  }
  const results = (
    await Promise.all(
      users.map((user) =>
        sendAssignmentNotification({
          recipients: [
            {
              userId: String(user._id),
              name: user.name,
              email: user.email,
            },
          ],
          course: {
            id: String(course._id),
            title: course.title,
            slug: course.slug,
            settings: course.emailSettings,
          },
          assignment: {
            id: String(assignment._id),
            title: assignment.title,
            dueAt: assignment.dueAt,
            points: assignment.points,
            instructions: assignment.instructions,
            context:
              checkInContextForUser(assignment.targetContexts, user._id)
                ?.context || assignment.context,
            kind: "follow_up",
            meetingSlotCount: assignment.meetingSlots?.length,
            meetingTimezone: assignment.meetingSlots?.[0]?.timezone,
          },
          event: "updated",
          force: true,
        }),
      ),
    )
  ).flat();

  return NextResponse.json({ results });
}
