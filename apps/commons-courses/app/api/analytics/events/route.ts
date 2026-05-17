import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import {
  resolveAnalyticsCourseId,
  trackAnalyticsEvent,
  type TrackAnalyticsInput,
} from "@/lib/analytics";

export async function POST(req: NextRequest) {
  const session = await auth();
  const body = (await req.json().catch(() => ({}))) as TrackAnalyticsInput;
  if (!body.eventType) {
    return NextResponse.json({ error: "eventType is required." }, { status: 400 });
  }

  await connectDB();
  const courseId = body.courseId || (await resolveAnalyticsCourseId(body.courseSlug));
  await trackAnalyticsEvent({
    ...body,
    userId: session?.user?.id,
    courseId: courseId || undefined,
    request: req,
  });

  return NextResponse.json({ ok: true });
}
