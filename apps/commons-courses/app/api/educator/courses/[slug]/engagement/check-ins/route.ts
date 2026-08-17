import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { sendAssignmentNotification } from "@/lib/email/resend";
import { indexAssignmentForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
import LiveParticipant from "@/models/LiveParticipant";
import LiveSession from "@/models/LiveSession";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const body = await req.json();
  const title = String(body.title || "").trim();
  const instructions = String(body.instructions || "").trim();
  const sessionId = String(body.sessionId || "");
  const requestedTargets = Array.isArray(body.targetUserIds)
    ? body.targetUserIds.map(String)
    : [];
  if (!title || !instructions || !sessionId) {
    return NextResponse.json(
      { error: "Session, title, and check-in prompt are required." },
      { status: 400 },
    );
  }

  const liveSession = await LiveSession.findOne({
    _id: sessionId,
    courseId: result.course._id,
  }).select("_id");
  if (!liveSession) {
    return NextResponse.json({ error: "Live session not found." }, { status: 404 });
  }

  const participants = await LiveParticipant.find({
    sessionId: liveSession._id,
    ...(requestedTargets.length ? { userId: { $in: requestedTargets } } : {}),
  })
    .select("userId displayName email")
    .lean();
  if (!participants.length) {
    return NextResponse.json(
      { error: "Choose at least one learner who attended this session." },
      { status: 400 },
    );
  }

  const assignment = await Assignment.create({
    courseId: result.course._id,
    educatorId: result.session.userId,
    title,
    instructions,
    dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    points: 0,
    acceptsText: true,
    acceptsUrl: true,
    published: true,
    kind: "follow_up",
    sourceLiveSessionId: liveSession._id,
    targetUserIds: participants.map((participant) => participant.userId),
    context: String(body.context || "").trim() || undefined,
  });
  await indexAssignmentForSearch(assignment);

  await sendAssignmentNotification({
    recipients: participants.map((participant) => ({
      name: participant.displayName,
      email: participant.email,
    })),
    course: {
      title: result.course.title,
      slug: result.course.slug,
      settings: result.course.emailSettings,
    },
    assignment: {
      title: assignment.title,
      dueAt: assignment.dueAt,
      points: assignment.points,
      instructions: assignment.instructions,
      kind: "follow_up",
      id: String(assignment._id),
    },
    event: "created",
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
