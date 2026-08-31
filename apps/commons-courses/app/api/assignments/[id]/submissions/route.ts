import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { indexSubmissionForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
import CheckInNotification from "@/models/CheckInNotification";
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

  const selectedMeetingSlotId = String(body.selectedMeetingSlotId || "").trim();
  const meetingSlots = assignment.meetingSlots || [];
  if (assignment.meetingSlotRequired && !selectedMeetingSlotId) {
    return NextResponse.json(
      { error: "Choose a one-on-one check-in time before submitting." },
      { status: 400 },
    );
  }
  if (
    selectedMeetingSlotId &&
    !meetingSlots.some((slot: { id: string }) => slot.id === selectedMeetingSlotId)
  ) {
    return NextResponse.json(
      { error: "That one-on-one time is not available for this check-in." },
      { status: 400 },
    );
  }
  if (selectedMeetingSlotId) {
    const occupied = await Submission.exists({
      assignmentId: assignment._id,
      selectedMeetingSlotId,
      userId: { $ne: session.user.id },
    });
    if (occupied) {
      return NextResponse.json(
        { error: "That time was just booked. Please choose another slot." },
        { status: 409 },
      );
    }
  }

  let submission;
  try {
    submission = await Submission.findOneAndUpdate(
      { assignmentId: assignment._id, userId: session.user.id },
      {
        assignmentId: assignment._id,
        courseId: assignment.courseId,
        userId: session.user.id,
        text: body.text,
        url: body.url,
        selectedMeetingSlotId: selectedMeetingSlotId || undefined,
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
      { upsert: true, new: true, runValidators: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json(
        { error: "That time was just booked. Please choose another slot." },
        { status: 409 },
      );
    }
    throw error;
  }
  if (assignment.kind === "follow_up") {
    await CheckInNotification.findOneAndUpdate(
      { assignmentId: assignment._id, userId: session.user.id },
      {
        $set: { submittedAt: submission.submittedAt },
        $min: { startedAt: submission.submittedAt },
        $setOnInsert: {
          courseId: assignment.courseId,
          email: session.user.email,
          emailStatus: "not_sent",
        },
      },
      { upsert: true, runValidators: true },
    );
  }
  await indexSubmissionForSearch(submission);

  return NextResponse.json({ submission }, { status: 201 });
}
