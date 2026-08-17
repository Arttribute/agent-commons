import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { indexSubmissionForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
import Enrollment from "@/models/Enrollment";
import LiveParticipant from "@/models/LiveParticipant";
import Submission from "@/models/Submission";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  if (!body.text && !body.url) {
    return NextResponse.json(
      { error: "Add text or a URL before submitting." },
      { status: 400 }
    );
  }

  await connectDB();
  const assignment = await Assignment.findById(id);
  if (!assignment || !assignment.published) {
    return NextResponse.json(
      { error: "Assignment not found." },
      { status: 404 }
    );
  }

  if (
    assignment.targetUserIds?.length > 0 &&
    !assignment.targetUserIds.some(
      (userId: { toString(): string }) => userId.toString() === session.user.id,
    )
  ) {
    return NextResponse.json(
      { error: "This check-in is not assigned to you." },
      { status: 403 },
    );
  }

  const enrollment = await Enrollment.findOne({
    userId: session.user.id,
    courseId: assignment.courseId,
  });
  const participatedInSourceSession =
    !enrollment &&
    assignment.kind === "follow_up" &&
    assignment.sourceLiveSessionId
      ? await LiveParticipant.exists({
          sessionId: assignment.sourceLiveSessionId,
          userId: session.user.id,
          courseId: assignment.courseId,
        })
      : false;
  if (!enrollment && !participatedInSourceSession) {
    return NextResponse.json({ error: "Not enrolled." }, { status: 403 });
  }

  const submission = await Submission.findOneAndUpdate(
    { assignmentId: assignment._id, userId: session.user.id },
    {
      assignmentId: assignment._id,
      courseId: assignment.courseId,
      userId: session.user.id,
      text: body.text,
      url: body.url,
      checkInStatus:
        assignment.kind === "follow_up" &&
        ["not_started", "in_progress", "blocked", "completed"].includes(
          body.checkInStatus,
        )
          ? body.checkInStatus
          : undefined,
      status: "submitted",
      submittedAt: new Date(),
    },
    { upsert: true, new: true, runValidators: true }
  );
  await indexSubmissionForSearch(submission);

  return NextResponse.json({ submission }, { status: 201 });
}
