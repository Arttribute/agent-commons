import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Assignment from "@/models/Assignment";
import CheckInNotification from "@/models/CheckInNotification";
import Enrollment from "@/models/Enrollment";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();
  const assignment = await Assignment.findById(id).select(
    "_id courseId kind published targetUserIds",
  );
  if (!assignment || assignment.kind !== "follow_up" || !assignment.published) {
    return NextResponse.json({ error: "Check-in not found." }, { status: 404 });
  }
  if (
    assignment.targetUserIds.length > 0 &&
    !assignment.targetUserIds.some(
      (userId: { toString(): string }) => String(userId) === session.user.id,
    )
  ) {
    return NextResponse.json(
      { error: "This check-in is not assigned to you." },
      { status: 403 },
    );
  }
  const enrolled = await Enrollment.exists({
    courseId: assignment.courseId,
    userId: session.user.id,
    status: { $ne: "cancelled" },
  });
  if (!enrolled) {
    return NextResponse.json({ error: "Not enrolled." }, { status: 403 });
  }

  const notification = await CheckInNotification.findOneAndUpdate(
    { assignmentId: assignment._id, userId: session.user.id },
    {
      $min: { startedAt: new Date() },
      $setOnInsert: {
        courseId: assignment.courseId,
        email: session.user.email,
        emailStatus: "not_sent",
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  return NextResponse.json({ startedAt: notification.startedAt });
}
