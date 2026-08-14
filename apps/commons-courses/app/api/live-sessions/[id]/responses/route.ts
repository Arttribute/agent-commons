import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import LiveParticipant from "@/models/LiveParticipant";
import LiveResponse from "@/models/LiveResponse";
import LiveSession from "@/models/LiveSession";
import type { LiveActivity, LiveActivityOption } from "@/types/live-session";
import { isValidLiveResponse } from "@/lib/live-response-policy";

export async function POST(
  req: NextRequest,
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
  const body = await req.json().catch(() => ({}));
  const activityId = typeof body.activityId === "string" ? body.activityId : "";
  const value = body.value;
  if (!activityId || (!Array.isArray(value) && typeof value !== "string")) {
    return NextResponse.json({ error: "activityId and a response are required." }, { status: 400 });
  }
  if (typeof value === "string" && (!value.trim() || value.length > 10_000)) {
    return NextResponse.json({ error: "Enter a response under 10,000 characters." }, { status: 400 });
  }
  await connectDB();
  const session = await LiveSession.findById(id);
  const activity = session?.activities.find((item: LiveActivity) => item.id === activityId);
  if (!session || !activity) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }
  if (activity.status !== "open") {
    return NextResponse.json({ error: "This activity is not open." }, { status: 409 });
  }
  if (!isValidLiveResponse(activity, value)) {
    return NextResponse.json(
      { error: "Choose a valid response before submitting." },
      { status: 400 },
    );
  }
  if (session.pace === "facilitator" && session.currentActivityId !== activity.id) {
    return NextResponse.json({ error: "Wait for the facilitator to open this activity." }, { status: 409 });
  }
  const participant = await LiveParticipant.findOne({
    sessionId: session._id,
    userId: currentUser.user.id,
  });
  if (!participant) {
    return NextResponse.json({ error: "Join the session before responding." }, { status: 403 });
  }
  const selectedValues = Array.isArray(value) ? value.map(String) : [String(value)];
  const correctOptions = activity.options
    .filter((option: LiveActivityOption) => option.isCorrect)
    .map((option: LiveActivityOption) => option.id);
  const isQuiz = activity.type === "quiz" && correctOptions.length > 0;
  const correct = isQuiz
    ? selectedValues.length === correctOptions.length &&
      selectedValues.every((selected) => correctOptions.includes(selected))
    : undefined;
  const response = await LiveResponse.findOneAndUpdate(
    { sessionId: session._id, activityId, participantId: participant._id },
    {
      $set: {
        courseId: session.courseId,
        userId: currentUser.user.id,
        value,
        correct,
        pointsAwarded: correct ? activity.points : 0,
        submittedAt: new Date(),
      },
    },
    { new: true, upsert: true },
  );
  participant.lastSeenAt = new Date();
  participant.status = "active";
  await participant.save();
  return NextResponse.json({
    response: {
      activityId,
      value: response.value,
      correct:
        activity.showResults && activity.status === "closed" ? response.correct : undefined,
      pointsAwarded: response.pointsAwarded,
      submittedAt: response.submittedAt,
    },
  });
}
