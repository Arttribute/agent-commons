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
import LiveSession from "@/models/LiveSession";
import type { LiveActivity } from "@/types/live-session";

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
  const patch = normalizeSessionPatch(body);

  if (record.command === "open_lobby") {
    session.status = "lobby";
  } else if (record.command === "start") {
    session.status = "live";
    const current = session.activities.find(
      (activity: LiveActivity) =>
        activity.id === session.currentActivityId && activity.status === "open",
    );
    const first = current || session.activities[0];
    if (first) {
      if (session.pace === "learner") {
        for (const activity of session.activities) activity.status = "open";
      } else {
        for (const activity of session.activities)
          activity.status = activity.id === first.id ? "open" : "closed";
      }
      session.currentActivityId = first.id;
    }
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
    session.status = "live";
    session.currentActivityId = activityId;
    for (const activity of session.activities) {
      if (activity.id === activityId) activity.status = "open";
      else if (session.pace === "facilitator" && activity.status === "open") {
        activity.status = "closed";
      }
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
  }

  session.stateVersion = (session.stateVersion || 0) + 1;
  session.markModified("activities");
  await session.save();
  return NextResponse.json({
    session: await serializeEducatorLiveSession(
      session,
      result.course.title,
      result.course.theme,
    ),
  });
}
