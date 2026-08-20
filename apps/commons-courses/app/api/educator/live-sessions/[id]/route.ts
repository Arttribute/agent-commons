import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { normalizeSessionPatch } from "@/lib/live-session-input";
import {
  getParticipants,
  getSessionResults,
  serializeEducatorLiveSession,
} from "@/lib/live-session-data";
import LiveSession, { type ILiveSession } from "@/models/LiveSession";
import type { LiveActivity, LiveSessionPart } from "@/types/live-session";
import { activityStatusesForLivePace } from "@/lib/live-session-pacing";
import {
  activityStatusesForParts,
  firstActivityIdForPart,
  partForActivity,
} from "@/lib/live-session-parts";

function syncActivityStatusesForPace(session: ILiveSession) {
  if (session.parts?.length) {
    const statuses = activityStatusesForParts({
      activities: session.activities,
      parts: session.parts,
      currentActivityId: session.currentActivityId,
    });
    for (const activity of session.activities) {
      activity.status = statuses[activity.id];
    }
    return;
  }
  const next = activityStatusesForLivePace({
    activities: session.activities,
    currentActivityId: session.currentActivityId,
    pace: session.pace,
  });
  session.currentActivityId = next.currentActivityId;
  for (const activity of session.activities) {
    activity.status = next.statuses[activity.id];
  }
}

async function authorize(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const session = await LiveSession.findById(id);
  if (!session) return null;
  const result = await requireEducatorCourse(session.courseSlug);
  if (result.error) return { error: result.error, session: null, result: null };
  return { error: null, session, result };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authResult = await authorize(id);
  if (!authResult)
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (authResult.error) return authResult.error;
  const { session, result } = authResult;
  const [serialized, participants, results] = await Promise.all([
    serializeEducatorLiveSession(
      session,
      result.course.title,
      result.course.theme,
    ),
    getParticipants(session._id),
    getSessionResults(session, session.settings.showParticipantNames),
  ]);
  return NextResponse.json({ session: serialized, participants, results });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authResult = await authorize(id);
  if (!authResult)
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (authResult.error) return authResult.error;
  const { session, result } = authResult;
  const body = await req.json().catch(() => ({}));
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const patch = normalizeSessionPatch(body, session.activities);

  if (record.command === "open_lobby") {
    session.status = "lobby";
  } else if (record.command === "start") {
    session.status = "live";
    syncActivityStatusesForPace(session);
  } else if (record.command === "end") {
    session.status = "ended";
    for (const activity of session.activities) {
      if (activity.status === "open") activity.status = "closed";
    }
  } else if (record.command === "activate") {
    const activityId =
      typeof record.activityId === "string" ? record.activityId : "";
    if (
      !session.activities.some(
        (activity: LiveActivity) => activity.id === activityId,
      )
    ) {
      return NextResponse.json(
        { error: "Activity not found." },
        { status: 404 },
      );
    }
    const part = partForActivity(session, activityId);
    if (part && part.status !== "open") {
      return NextResponse.json(
        { error: `Open ${part.title} before presenting its activities.` },
        { status: 409 },
      );
    }
    session.status = "live";
    session.currentActivityId = activityId;
    if (part) {
      session.currentPartId = part.id;
      session.pace = part.pace;
    }
    syncActivityStatusesForPace(session);
  } else if (record.command === "open_part") {
    const partId = typeof record.partId === "string" ? record.partId : "";
    const part = session.parts.find(
      (item: LiveSessionPart) => item.id === partId,
    );
    if (!part) {
      return NextResponse.json(
        { error: "Programme session not found." },
        { status: 404 },
      );
    }
    for (const item of session.parts)
      item.status = item.id === partId ? "open" : "closed";
    session.currentPartId = part.id;
    session.pace = part.pace;
    session.currentActivityId = firstActivityIdForPart(
      session.activities,
      part,
    );
    session.status = "live";
    syncActivityStatusesForPace(session);
  } else if (record.command === "set_part_pace") {
    const partId = typeof record.partId === "string" ? record.partId : "";
    const pace = record.pace === "learner" ? "learner" : "facilitator";
    const part = session.parts.find(
      (item: LiveSessionPart) => item.id === partId,
    );
    if (!part) {
      return NextResponse.json(
        { error: "Programme session not found." },
        { status: 404 },
      );
    }
    part.pace = pace;
    if (part.status === "open") {
      session.currentPartId = part.id;
      session.pace = pace;
      session.currentActivityId = part.activityIds.includes(
        session.currentActivityId || "",
      )
        ? session.currentActivityId
        : firstActivityIdForPart(session.activities, part);
      syncActivityStatusesForPace(session);
    }
  } else if (record.command === "close_activity") {
    const activityId =
      typeof record.activityId === "string" ? record.activityId : "";
    const activity = session.activities.find(
      (item: LiveActivity) => item.id === activityId,
    );
    if (!activity)
      return NextResponse.json(
        { error: "Activity not found." },
        { status: 404 },
      );
    activity.status = "closed";
  } else if (Object.keys(patch).length) {
    session.set(patch);
    if (session.status === "live" && "pace" in patch) {
      syncActivityStatusesForPace(session);
    }
  }

  session.stateVersion = (session.stateVersion || 0) + 1;
  session.markModified("activities");
  session.markModified("parts");
  await session.save();
  return NextResponse.json({
    session: await serializeEducatorLiveSession(
      session,
      result.course.title,
      result.course.theme,
    ),
  });
}
