import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import {
  buildLiveCheckInContext,
  checkInContextForUser,
  type CheckInContextSource,
  type CheckInResponseLike,
} from "@/lib/check-in-context";
import { sendAssignmentNotification } from "@/lib/email/resend";
import { indexAssignmentForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
import LiveParticipant from "@/models/LiveParticipant";
import LiveResponse from "@/models/LiveResponse";
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
  const notifyNow = body.notifyNow !== false;
  if (!title || !instructions || !sessionId) {
    return NextResponse.json(
      { error: "Session, title, and check-in prompt are required." },
      { status: 400 },
    );
  }

  const liveSession = await LiveSession.findOne({
    _id: sessionId,
    courseId: result.course._id,
  }).select("_id activities");
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

  const sharedContext = String(body.context || "").trim() || undefined;
  const requestedContexts = Array.isArray(body.targetContexts)
    ? body.targetContexts
    : [];
  const allowedUserIds = new Set(
    participants.map((participant) => String(participant.userId)),
  );
  const providedContexts = new Map<
    string,
    { context: string; source: CheckInContextSource }
  >();
  for (const item of requestedContexts) {
    if (!item || typeof item !== "object") continue;
    const userId = String(item.userId || "");
    const context = String(item.context || "").trim().slice(0, 12_000);
    if (!allowedUserIds.has(userId) || !context) continue;
    providedContexts.set(userId, { context, source: "manual" });
  }
  const liveResponses =
    !sharedContext && providedContexts.size < participants.length
      ? await LiveResponse.find({
          sessionId: liveSession._id,
          userId: { $in: participants.map((participant) => participant.userId) },
        })
          .sort({ submittedAt: -1 })
          .lean()
      : [];
  const targetContexts = sharedContext
    ? []
    : participants.flatMap((participant) => {
        const userId = String(participant.userId);
        const personalized =
          providedContexts.get(userId) ||
          buildLiveCheckInContext({
            activities: liveSession.activities || [],
            responses: liveResponses as unknown as CheckInResponseLike[],
            userId: participant.userId,
          });
        return personalized?.context
          ? [
              {
                userId: participant.userId,
                context: personalized.context,
                source: personalized.source,
              },
            ]
          : [];
      });

  const assignment = await Assignment.create({
    courseId: result.course._id,
    educatorId: result.session.userId,
    title,
    instructions,
    dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    points: 0,
    acceptsText: true,
    acceptsUrl: true,
    published: notifyNow,
    kind: "follow_up",
    sourceLiveSessionId: liveSession._id,
    targetUserIds: participants.map((participant) => participant.userId),
    targetContexts,
    context: sharedContext,
  });
  await indexAssignmentForSearch(assignment);

  const notifications = notifyNow
    ? await Promise.all(
        participants.map((participant) =>
          sendAssignmentNotification({
            recipients: [
              {
                userId: String(participant.userId),
                name: participant.displayName,
                email: participant.email,
              },
            ],
            course: {
              id: String(result.course._id),
              title: result.course.title,
              slug: result.course.slug,
              settings: result.course.emailSettings,
            },
            assignment: {
              title: assignment.title,
              dueAt: assignment.dueAt,
              points: assignment.points,
              instructions: assignment.instructions,
              context:
                checkInContextForUser(
                  assignment.targetContexts,
                  participant.userId,
                )?.context || assignment.context,
              kind: "follow_up",
              id: String(assignment._id),
              meetingSlotCount: assignment.meetingSlots?.length,
              meetingTimezone: assignment.meetingSlots?.[0]?.timezone,
            },
            event: "created",
          }),
        ),
      )
    : [];

  return NextResponse.json(
    { assignment, notifications: notifications.flat(), draft: !notifyNow },
    { status: 201 },
  );
}
