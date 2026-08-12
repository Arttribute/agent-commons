import { NextRequest, NextResponse } from "next/server";
import { createJoinCode, normalizeSessionCreate } from "@/lib/live-session-input";
import { serializeEducatorLiveSession } from "@/lib/live-session-data";
import { requireEducatorCourse } from "@/lib/educator-auth";
import LiveSession from "@/models/LiveSession";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  const sessions = await LiveSession.find({ courseId: result.course._id })
    .sort({ createdAt: -1 })
    .limit(100);
  return NextResponse.json({
    sessions: await Promise.all(
      sessions.map((session) =>
        serializeEducatorLiveSession(session, result.course.title),
      ),
    ),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;
  const input = normalizeSessionCreate(await req.json().catch(() => ({})));
  let joinCode = createJoinCode();
  while (await LiveSession.exists({ joinCode })) joinCode = createJoinCode();
  const session = await LiveSession.create({
    ...input,
    courseId: result.course._id,
    courseSlug: result.course.slug,
    joinCode,
    createdBy: result.session.userId,
  });
  return NextResponse.json(
    { session: await serializeEducatorLiveSession(session, result.course.title) },
    { status: 201 },
  );
}

